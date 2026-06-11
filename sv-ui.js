// ============================================================================
// SCENT VESSEL — UI layer (vanilla JS)
// Builds the formula sheet, renders rationale + CMF board, drives the scene.
// ============================================================================
(function () {
  'use strict';
  const { FAMILIES, CONCENTRATIONS, PRESETS, derive, randomFormula } = window.SVM;
  const $ = (s) => document.querySelector(s);

  // ------------------------------------------------------------- state
  let state = JSON.parse(JSON.stringify(PRESETS[0].state));
  let formulaName = PRESETS[0].name;
  let brand = '';
  let dirty = false;
  let design = null;
  let sceneReady = false;
  let turntableOn = false, capOpen = false;
  let animateFillNext = false;
  // user fine-tune overrides on top of the parametric CMF
  let cmf = { chips: {}, chipNames: {}, mats: {}, finish: {}, dims: {} };
  function cmfActive() {
    return Object.keys(cmf.chips).length || Object.keys(cmf.chipNames).length ||
      Object.keys(cmf.mats).length || Object.keys(cmf.finish).length || Object.keys(cmf.dims).length;
  }
  function applyCMF(d) {
    Object.keys(cmf.chips).forEach((i) => { if (d.chips[i]) d.chips[i].hex = cmf.chips[i]; });
    Object.keys(cmf.chipNames).forEach((i) => { if (d.chips[i]) d.chips[i].name = cmf.chipNames[i]; });
    // colour chips drive the physical material so the 3D bottle re-tints
    if (cmf.chips[0]) d.material.juice = cmf.chips[0];
    if (cmf.chips[1]) d.material.tint = cmf.chips[1];
    if (cmf.chips[2]) d.cap.color = cmf.chips[2];
    if (cmf.chips[3]) d.collar.color = cmf.chips[3];
    if (cmf.mats.body) applyBodyOverride(d, cmf.mats.body);
    if (cmf.mats.glassType) d.glassType = cmf.mats.glassType;
    if (cmf.mats.cap) d.cap.label = cmf.mats.cap;
    if (cmf.mats.collar) d.collar.label = cmf.mats.collar;
    if (cmf.mats.atomiser) d.atomizer.label = cmf.mats.atomiser;
    Object.keys(cmf.finish).forEach((i) => { if (d.finishSpec[i]) d.finishSpec[i].name = cmf.finish[i]; });
    applyDims(d);
  }
  // body material override — repoint the body to a chosen material, deriving a
  // sensible colour/label/finish so the 3D bottle and CMF stay consistent.
  const BODY_LABELS = { glass: 'Tinted flint glass', frosted: 'Acid-etched glass', opaline: 'Opaline cased glass', smoked: 'Smoked glass', metal: 'Anodised aluminium', wood: 'Turned walnut', ceramic: 'Glazed ceramic', lacquer: 'Lacquered metal' };
  const BODY_FINISH = { glass: 'High gloss', frosted: 'Frosted', opaline: 'Opaline', smoked: 'Smoked', metal: 'Anodised satin', wood: 'Oiled, open-pore', ceramic: 'Soft-gloss glaze', lacquer: 'High-gloss lacquer' };
  function applyBodyOverride(d, type) {
    const m = d.material, L = window.SVM;
    const opaque = type === 'metal' || type === 'wood' || type === 'ceramic' || type === 'lacquer';
    const colors = {
      glass: m.tint, frosted: L.lighten(m.tint, 0.34), opaline: '#f0e8d8', smoked: L.darken(m.tint, 0.35),
      metal: '#a7afb3', wood: '#6e4f33', ceramic: L.lighten(m.tint, 0.3), lacquer: L.darken(m.juice, 0.32),
    };
    m.body = type; m.bodyLabel = BODY_LABELS[type] || 'Glass'; m.bodyColor = colors[type] || m.tint; m.opaque = opaque;
    m.frosted = type === 'frosted'; m.opaline = type === 'opaline'; m.smoked = type === 'smoked';
    d.glassType = m.bodyLabel;
    if (d.finishSpec[0]) d.finishSpec[0].name = BODY_FINISH[type] || 'High gloss';
  }
  // direct-entry geometry overrides: recompute the form + display dims from the
  // numbers the user typed (mm / aspect ratio). mm = 78 scene-units (matches sv-mapping).
  const MM = 78;
  function applyDims(d) {
    const o = cmf.dims;
    if (!o || !Object.keys(o).length) return;
    const f = d.form, scale = f.scale;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const curWmm = f.W * MM / Math.sqrt(f.depthRatio);
    const wMm = o.w != null ? o.w : curWmm;
    const dr = clamp(o.d != null ? o.d / wMm : f.depthRatio, 0.3, 1.0);
    const Wt = wMm * Math.sqrt(dr) / MM;
    const wf = f.W > 0 ? Wt / f.W : 1;
    f.W = Wt; f.bodyR *= wf; f.baseR *= wf; f.shoulderR *= wf; f.neckR *= wf;
    f.depthRatio = dr;
    if (o.h != null) f.H = Math.max((o.h - 28 * scale) / MM, 0.1);
    else if (o.aspect != null) f.H = clamp(o.aspect, 0.3, 4) * f.W;
    if (o.wall != null) f.wall = Math.max(o.wall / MM, 0.004);
    f.aspect = f.H / f.W;
    const wx = 1 / Math.sqrt(f.depthRatio);
    const ml = clamp(Math.PI * Math.pow((f.W / 2) * 0.82, 2) * f.H * 0.62 * f.depthRatio * MM * MM * MM / 1000, 5, 400);
    d.dims = {
      h: Math.round(f.H * MM + 28 * scale),
      w: Math.round(f.W * MM * wx),
      d: Math.round(f.W * MM * f.depthRatio * wx),
      wall: (f.wall * MM).toFixed(1),
      ml: Math.round(ml / 5) * 5,
    };
  }
  function markCMFState() {
    const on = !!cmfActive();
    $('#cmf-edited').classList.toggle('on', on);
    $('#cmf-reset').classList.toggle('on', on);
  }

  // ------------------------------------------------------------- slider factory
  function makeSlider(parent, { label, min, max, step, value, unit, onInput }) {
    const row = document.createElement('div');
    row.className = 'sl-row';
    row.innerHTML =
      '<div class="sl-head"><span class="sl-label">' + label + '</span>' +
      '<span class="sl-val mono"></span></div>' +
      '<input class="sl-input" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">';
    const input = row.querySelector('input');
    const val = row.querySelector('.sl-val');
    input.addEventListener('input', () => { input.setAttribute('value', input.value); onInput(parseFloat(input.value)); markDirty(); recompute(); });
    parent.appendChild(row);
    return {
      input, val,
      set(v) { input.value = v; input.setAttribute('value', v); },
      display(text) { val.textContent = text; },
    };
  }

  // ------------------------------------------------------------- build controls
  const famSliders = {};
  FAMILIES.forEach((f) => {
    famSliders[f.key] = makeSlider($('#family-sliders'), {
      label: f.label, min: 0, max: 100, step: 1, value: state.families[f.key] || 0,
      onInput: (v) => { state.families[f.key] = v; },
    });
    famSliders[f.key].input.style.setProperty('--sw', f.tint);
  });

  const stSliders = {};
  [['top', 'Top'], ['heart', 'Heart'], ['base', 'Base']].forEach(([k, label]) => {
    stSliders[k] = makeSlider($('#structure-sliders'), {
      label, min: 0, max: 100, step: 1, value: state.structure[k],
      onInput: (v) => { state.structure[k] = v; },
    });
  });

  // concentration segmented
  const concSeg = $('#conc-seg');
  CONCENTRATIONS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'seg-btn';
    b.innerHTML = '<span>' + c.short + '</span><span class="seg-pct mono">' + c.pct + '</span>';
    b.addEventListener('click', () => { state.concentration = i; markDirty(); syncConc(); recompute(); });
    concSeg.appendChild(b);
  });
  function syncConc() {
    [...concSeg.children].forEach((b, i) => b.classList.toggle('on', i === state.concentration));
  }

  const longevitySl = makeSlider($('#char-sliders'), {
    label: 'Longevity', min: 2, max: 24, step: 1, value: state.longevity,
    onInput: (v) => { state.longevity = v; },
  });
  const sillageSl = makeSlider($('#char-sliders'), {
    label: 'Sillage', min: 0, max: 100, step: 1, value: state.sillage * 100,
    onInput: (v) => { state.sillage = v / 100; },
  });

  // presets
  PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'preset-btn';
    b.innerHTML = '<span class="preset-name">' + p.name + '</span><span class="preset-sub">' + p.sub + '</span>';
    b.addEventListener('click', () => loadPreset(p, b));
    $('#presets').appendChild(b);
  });

  function loadPreset(p, btn) {
    loadFormula(p);
  }
  // unified loader for presets + randomiser; animates the fill rise
  function loadFormula(p) {
    state = JSON.parse(JSON.stringify(p.state));
    formulaName = p.name;
    dirty = false;
    brand = p.name;
    $('#brand-input').value = brand;
    if (sceneReady) window.SV.setBrand(brand);
    // each formula starts from its parametric CMF + the default label angle
    cmf = { chips: {}, chipNames: {}, mats: {}, finish: {}, dims: {} };
    labelPos.angle = DEFAULT_LABEL_ANGLE * Math.PI / 180;
    if (labelAngleSl) labelAngleSl.set(DEFAULT_LABEL_ANGLE);
    if (sceneReady) window.SV.setLabelPos({ angle: labelPos.angle });
    // reset label colour to Auto on a fresh formula
    labelColorOverride = null;
    if (lcAuto) lcAuto.classList.add('on');
    if (lcRow) lcRow.querySelector('.lc-swatch').style.background = '';
    if (sceneReady) window.SV.setLabelColor(null);
    animateFillNext = true;
    syncAllInputs();
    recompute();
  }
  function markDirty() {
    if (!dirty) { dirty = true; }
  }
  function syncAllInputs() {
    FAMILIES.forEach((f) => famSliders[f.key].set(state.families[f.key] || 0));
    Object.keys(stSliders).forEach((k) => stSliders[k].set(state.structure[k]));
    longevitySl.set(state.longevity);
    sillageSl.set(state.sillage * 100);
    syncConc();
  }

  // studio controls (camera presets) — wired straight to scene
  const CAMS = [['hero', 'Hero'], ['packshot', 'Packshot'], ['macro', 'Macro'], ['top', 'Top']];
  let curCam = 'hero';
  function renderStudio() {
    const cp = $('#camera-presets');
    if (cp) cp.innerHTML = CAMS.map(([v, t]) => '<button class="bs-btn' + (v === curCam ? ' on' : '') + '" data-cam="' + v + '">' + t + '</button>').join('');
    cp && cp.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => { curCam = b.dataset.cam; renderStudio(); if (sceneReady) window.SV.setCamera(curCam); }));
  }
  renderStudio();

  // ------------------------------------------------------------- recompute
  let geomTimer = null;
  function recompute() {
    design = derive(state);
    applyCMF(design);
    markCMFState();
    // slider value readouts (normalized shares)
    FAMILIES.forEach((f) => famSliders[f.key].display(Math.round(design.shares[f.key] * 100) + '%'));
    stSliders.top.display(Math.round(design.structure.top * 100) + '%');
    stSliders.heart.display(Math.round(design.structure.heart * 100) + '%');
    stSliders.base.display(Math.round(design.structure.base * 100) + '%');
    longevitySl.display(state.longevity + ' h');
    sillageSl.display(Math.round(state.sillage * 100) + '/100');
    [...$('#presets').children].forEach((b, i) =>
      b.classList.toggle('on', !dirty && PRESETS[i].name === formulaName));
    renderRationale();
    renderCMF();
    renderStats();
    // throttle geometry rebuild
    if (!geomTimer) {
      geomTimer = setTimeout(() => {
        geomTimer = null;
        if (sceneReady) { window.SV.update(design, animateFillNext); animateFillNext = false; }
      }, 70);
    }
  }

  function renderStats() {
    const d = design;
    $('#stat-name').textContent = formulaName + (dirty ? ' *' : '');
    $('#stats').innerHTML =
      statIn('ASPECT', 'aspect', d.form.aspect.toFixed(2), 0.01, ' : 1') +
      stat('SECTION', d.form.sectionName.toUpperCase()) +
      stat('PATTERN', d.form.relief.label.toUpperCase()) +
      stat('DECOR', (d.decor ? d.decor.label : '—').toUpperCase()) +
      statDims(d.dims) +
      statIn('WALL', 'wall', d.dims.wall, 0.1, ' mm') +
      stat('VOL', d.dims.ml + ' ml') +
      stat('CONC', d.conc.short.toUpperCase());
    // wire direct-entry geometry inputs
    $('#stats').querySelectorAll('input[data-dim]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (isFinite(v) && v > 0) { cmf.dims[inp.dataset.dim] = v; markCMFState(); recompute(); if (sceneReady) window.SV.update(design, false); }
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    });
  }
  function stat(k, v) {
    return '<span class="stat"><span class="stat-k">' + k + '</span><span class="stat-v mono">' + v + '</span></span>';
  }
  function statIn(k, dim, val, step, suffix) {
    return '<span class="stat"><span class="stat-k">' + k + '</span>' +
      '<span class="stat-v mono"><input class="stat-in" type="number" step="' + step + '" data-dim="' + dim + '" value="' + val + '">' + (suffix || '') + '</span></span>';
  }
  function statDims(dm) {
    return '<span class="stat"><span class="stat-k">H × W × D</span><span class="stat-v mono">' +
      '<input class="stat-in" type="number" step="1" data-dim="h" value="' + dm.h + '">×' +
      '<input class="stat-in" type="number" step="1" data-dim="w" value="' + dm.w + '">×' +
      '<input class="stat-in" type="number" step="1" data-dim="d" value="' + dm.d + '"> mm</span></span>';
  }

  // ------------------------------------------------------------- rationale
  function renderRationale() {
    const el = $('#rationale');
    el.innerHTML = '';
    design.rationale.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'rat-item';
      item.innerHTML = '<div class="rat-title">' + r.title + '</div><div class="rat-text">' + r.text + '</div>';
      item.addEventListener('mouseenter', () => { if (sceneReady) window.SV.highlight(r.region); item.classList.add('hot'); });
      item.addEventListener('mouseleave', () => { if (sceneReady) window.SV.highlight(null); item.classList.remove('hot'); });
      el.appendChild(item);
    });
  }

  // ------------------------------------------------------------- CMF board
  function renderCMF() {
    const d = design;
    $('#chips').innerHTML = d.chips.map((c, i) =>
      '<div class="chip">' +
        '<label class="chip-swatch" style="background:' + c.hex + '" title="Click to recolour">' +
          '<input type="color" class="chip-pick" data-i="' + i + '" value="' + toHex6(c.hex) + '">' +
        '</label>' +
        '<div class="chip-meta">' +
          '<span class="chip-role">' + c.role + '</span>' +
          '<span class="chip-name" data-edit data-kind="chipName" data-i="' + i + '" contenteditable="true" spellcheck="false">' + esc(c.name) + '</span>' +
          '<span class="chip-hex mono">' + c.hex.toUpperCase() + '</span>' +
        '</div>' +
      '</div>'
    ).join('');
    $('#chips').querySelectorAll('.chip-pick').forEach((inp) => {
      inp.addEventListener('input', () => onChipColor(+inp.dataset.i, inp.value));
    });
    $('#chips').querySelectorAll('[data-kind="chipName"]').forEach((el) => {
      el.addEventListener('input', () => { cmf.chipNames[+el.dataset.i] = el.textContent.trim(); markCMFState(); $('#packaging').innerHTML = cartonHTML(design); });
    });

    $('#materials').innerHTML =
      matRow('Body', d.glassType, d.glassWhy, 'glassType') +
      matRow('Cap', d.cap.label, d.cap.why, 'cap') +
      matRow('Collar', d.collar.label, d.collar.why, 'collar') +
      matRow('Atomiser', d.atomizer.label, d.atomizer.why, 'atomiser');
    $('#materials').querySelectorAll('[data-kind="mat"]').forEach((el) => {
      el.addEventListener('input', () => { cmf.mats[el.dataset.key] = el.textContent.trim(); markCMFState(); });
    });
    renderBodySelect(d);

    $('#finish').innerHTML = d.finishSpec.map((f, i) =>
      '<div class="fin-row"><span class="fin-target mono">' + f.target.toUpperCase() + '</span>' +
      '<span class="fin-name" data-edit data-kind="fin" data-i="' + i + '" contenteditable="true" spellcheck="false">' + esc(f.name) + '</span>' +
      '<span class="fin-why">' + f.why + '</span></div>'
    ).join('');
    $('#finish').querySelectorAll('[data-kind="fin"]').forEach((el) => {
      el.addEventListener('input', () => { cmf.finish[+el.dataset.i] = el.textContent.trim(); markCMFState(); });
    });

    $('#packaging').innerHTML = cartonHTML(d);
  }
  // live chip recolour — updates the design + 3D in place without rebuilding inputs
  function onChipColor(i, val) {
    cmf.chips[i] = val;
    design.chips[i].hex = val;
    if (i === 0) design.material.juice = val;
    if (i === 1) design.material.tint = val;
    if (i === 2) design.cap.color = val;
    if (i === 3) design.collar.color = val;
    const chipEl = $('#chips').children[i];
    if (chipEl) { chipEl.querySelector('.chip-swatch').style.background = val; chipEl.querySelector('.chip-hex').textContent = val.toUpperCase(); }
    $('#packaging').innerHTML = cartonHTML(design);
    markCMFState();
    if (sceneReady) window.SV.update(design, false);
  }
  function toHex6(h) {
    h = (h || '').trim();
    if (/^#([0-9a-f]{3})$/i.test(h)) return '#' + h.slice(1).split('').map((c) => c + c).join('');
    if (/^#([0-9a-f]{6})$/i.test(h)) return h;
    return '#cccccc';
  }
  // packaging form derived from the bottle's geometry/scent
  function packageType(d) {
    const f = d.form;
    if (f.faceted) return 'hex';
    if (f.aspect > 1.7) return 'tall';
    if (f.aspect < 0.95) return 'drum';
    if ((d.dom.key === 'woody' || d.dom.key === 'amber' || d.dom.key === 'spicy') && f.concT >= 0.5) return 'tube';
    return 'box';
  }
  function pkgLabel(cx, w, o, y) {
    const wrap = wrapBrand(o.name, w * 0.82);
    const lineH = wrap.fs * 1.06;
    const startY = y.brand - (wrap.lines.length - 1) * lineH / 2;
    const tsp = wrap.lines.map((ln, k) => '<tspan x="' + cx + '" dy="' + (k === 0 ? 0 : lineH).toFixed(1) + '">' + esc(ln) + '</tspan>').join('');
    return '<text x="' + cx + '" y="' + y.mark + '" fill="' + o.foil + '" font-family="IBM Plex Mono, monospace" font-size="7" letter-spacing="3" text-anchor="middle">PARFUM</text>' +
      '<text x="' + cx + '" y="' + startY.toFixed(1) + '" fill="' + o.foil + '" font-family=\'' + o.font + '\' font-weight="700" font-size="' + wrap.fs.toFixed(1) + '" letter-spacing="1" text-anchor="middle">' + tsp + '</text>' +
      '<rect x="' + (cx - w * 0.26) + '" y="' + y.bar + '" width="' + (w * 0.52) + '" height="2.4" fill="' + o.accent + '"/>' +
      '<text x="' + cx + '" y="' + y.sub + '" fill="' + o.foil + '" font-family="IBM Plex Mono, monospace" font-size="6.5" letter-spacing="2" text-anchor="middle" opacity="0.8">' + o.conc + ' · ' + o.ml + ' ML</text>';
  }
  function cartonHTML(d) {
    const L = window.SVM, board = d.chips[1].hex, side = d.chips[4].hex;
    const top = L.lighten(board, 0.16), shade = L.darken(board, 0.2), accent = d.chips[0].hex;
    const foil = d.label ? (d.label.cartonInk || d.label.ink) : (d.decor ? d.decor.gold : '#c9a24a');
    const font = d.label ? d.label.font : 'Archivo, sans-serif';
    const name = ((brand || formulaName) || '').toUpperCase();
    const o = { board, side, top, shade, accent, foil, font, name, conc: d.conc.short.toUpperCase(), ml: d.dims.ml };
    const type = packageType(d);
    const VB = 'viewBox="-10 -42 196 232"';
    let svg;
    if (type === 'tube' || type === 'drum') {
      const rx = type === 'tube' ? 40 : 78, bodyH = type === 'tube' ? 188 : 98, cx = 88, ellH = rx * 0.34;
      svg = '<svg class="ct-svg" ' + VB + ' xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="' + (cx - rx) + '" y="0" width="' + (2 * rx) + '" height="' + bodyH + '" fill="' + board + '"/>' +
        '<path d="M' + (cx - rx) + ' ' + bodyH + ' A ' + rx + ' ' + ellH + ' 0 0 0 ' + (cx + rx) + ' ' + bodyH + '" fill="' + shade + '"/>' +
        '<rect x="' + (cx - rx) + '" y="0" width="' + (rx * 0.5) + '" height="' + bodyH + '" fill="' + shade + '" opacity="0.25"/>' +
        '<rect x="' + (cx + rx * 0.5) + '" y="0" width="' + (rx * 0.5) + '" height="' + bodyH + '" fill="#ffffff" opacity="0.12"/>' +
        '<ellipse cx="' + cx + '" cy="0" rx="' + rx + '" ry="' + ellH + '" fill="' + top + '"/>' +
        '<ellipse cx="' + cx + '" cy="0" rx="' + (rx * 0.66) + '" ry="' + (ellH * 0.66) + '" fill="' + shade + '" opacity="0.45"/>' +
        pkgLabel(cx, 2 * rx * 0.92, o, { mark: ellH + (bodyH - ellH) * 0.22, brand: ellH + (bodyH - ellH) * 0.48, bar: ellH + (bodyH - ellH) * 0.62, sub: ellH + (bodyH - ellH) * 0.8 }) +
        '</svg>';
    } else if (type === 'hex') {
      const cx = 86, w = 92, hgt = 176, fac = 22, lx = cx - w / 2, rxx = cx + w / 2;
      svg = '<svg class="ct-svg" ' + VB + ' xmlns="http://www.w3.org/2000/svg">' +
        '<polygon points="' + lx + ',0 ' + (lx - fac) + ',-13 ' + (lx - fac) + ',' + (hgt - 13) + ' ' + lx + ',' + hgt + '" fill="' + shade + '"/>' +
        '<polygon points="' + rxx + ',0 ' + (rxx + fac) + ',-13 ' + (rxx + fac) + ',' + (hgt - 13) + ' ' + rxx + ',' + hgt + '" fill="' + side + '"/>' +
        '<polygon points="' + lx + ',0 ' + (lx - fac) + ',-13 ' + cx + ',-24 ' + (rxx + fac) + ',-13 ' + rxx + ',0" fill="' + top + '"/>' +
        '<rect x="' + lx + '" y="0" width="' + w + '" height="' + hgt + '" fill="' + board + '"/>' +
        pkgLabel(cx, w, o, { mark: hgt * 0.24, brand: hgt * 0.5, bar: hgt * 0.64, sub: hgt * 0.8 }) +
        '</svg>';
    } else {
      const w = type === 'tall' ? 76 : 120, hgt = type === 'tall' ? 202 : 170, dx = type === 'tall' ? 30 : 40, dy = -23, cx = w / 2;
      const topPts = '0,0 ' + w + ',0 ' + (w + dx) + ',' + dy + ' ' + dx + ',' + dy;
      const sidePts = w + ',0 ' + (w + dx) + ',' + dy + ' ' + (w + dx) + ',' + (hgt + dy) + ' ' + w + ',' + hgt;
      svg = '<svg class="ct-svg" viewBox="-3 ' + (dy - 3) + ' ' + (w + dx + 6) + ' ' + (hgt - dy + 6) + '" xmlns="http://www.w3.org/2000/svg">' +
        '<polygon points="' + sidePts + '" fill="' + side + '"/>' +
        '<polygon points="' + topPts + '" fill="' + top + '"/>' +
        '<rect x="0" y="0" width="' + w + '" height="' + hgt + '" fill="' + board + '"/>' +
        pkgLabel(cx, w, o, { mark: hgt * 0.26, brand: hgt * 0.5, bar: hgt * 0.66, sub: hgt * 0.82 }) +
        '</svg>';
    }
    const lbl = { box: 'Folding carton', tall: 'Tall slim carton', hex: 'Hexagonal carton', tube: 'Cylindrical tube', drum: 'Round drum box' }[type];
    return '<div class="sh-carton">' + svg +
      '<div class="ct-meta mono">' + lbl.toUpperCase() + ' · ' + d.chips[1].name.toUpperCase() + ' BOARD<br>FOIL STAMP ' + foil.toUpperCase() + '<br>ACCENT ' + accent.toUpperCase() + '<br>SOFT-TOUCH MATT LAMINATE</div>' +
    '</div>';
  }
  function esc(s) { return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  // word-wrap the brand to fit the carton face; shrink font only for a single
  // word too long to break. Returns { lines:[], fs }.
  function wrapBrand(name, maxW) {
    const words = (name || '').split(/\s+/).filter(Boolean);
    if (!words.length) return { lines: [''], fs: 16 };
    const charW = (f) => f * 0.62;
    function layout(f) {
      const max = Math.max(1, Math.floor(maxW / charW(f)));
      const lines = []; let cur = '';
      words.forEach((wd) => {
        const t = cur ? cur + ' ' + wd : wd;
        if (t.length <= max || !cur) cur = t;
        else { lines.push(cur); cur = wd; }
      });
      if (cur) lines.push(cur);
      return lines;
    }
    let fs = 17;
    let lines = layout(fs);
    const fits = () => lines.every((l) => l.length * charW(fs) <= maxW + 0.5);
    while (!fits() && fs > 8) { fs -= 1; lines = layout(fs); }
    if (lines.length >= 3) { fs = Math.min(fs, 12); lines = layout(fs); }
    if (lines.length > 3) lines = lines.slice(0, 3);
    return { lines, fs };
  }
  function renderBodySelect(d) {
    const el = $('#body-select');
    if (!el) return;
    const opts = [
      ['', 'Auto'], ['glass', 'Glass'], ['frosted', 'Frosted'], ['opaline', 'Opaline'],
      ['smoked', 'Smoked'], ['metal', 'Metal'], ['wood', 'Wood'], ['ceramic', 'Ceramic'], ['lacquer', 'Lacquer'],
    ];
    const cur = cmf.mats.body || '';
    el.innerHTML = '<div class="bs-label mono">BODY MATERIAL · ' + (d.material.body || 'glass').toUpperCase() + '</div>' +
      '<div class="bs-opts">' +
      opts.map(([v, t]) => '<button class="bs-btn' + (v === cur ? ' on' : '') + '" data-body="' + v + '">' + t + '</button>').join('') +
      '</div>';
    el.querySelectorAll('.bs-btn').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.body) cmf.mats.body = b.dataset.body; else delete cmf.mats.body;
        markCMFState(); recompute(); if (sceneReady) window.SV.update(design, false);
      });
    });
  }
  function matRow(k, v, why, key) {
    return '<div class="mat-row"><span class="mat-k mono">' + k.toUpperCase() + '</span>' +
      '<div class="mat-body"><span class="mat-v" data-edit data-kind="mat" data-key="' + key + '" contenteditable="true" spellcheck="false">' + esc(v) + '</span><span class="mat-why">' + why + '</span></div></div>';
  }
  // reset all CMF fine-tuning back to the parametric derivation
  $('#cmf-reset').addEventListener('click', () => {
    cmf = { chips: {}, chipNames: {}, mats: {}, finish: {}, dims: {} };
    recompute();
    if (sceneReady) window.SV.update(design, false);
  });

  // ------------------------------------------------------------- toolbar
  $('#btn-turntable').addEventListener('click', function () {
    turntableOn = !turntableOn;
    this.classList.toggle('on', turntableOn);
    if (sceneReady) window.SV.setTurntable(turntableOn);
  });
  $('#btn-cap').addEventListener('click', function () {
    capOpen = !capOpen;
    this.classList.toggle('on', capOpen);
    this.querySelector('span').textContent = capOpen ? 'Seat cap' : 'Lift cap';
    if (sceneReady) window.SV.setCap(capOpen);
  });

  // brand / label engraving
  $('#brand-input').addEventListener('input', function () {
    brand = this.value;
    if (sceneReady) window.SV.setBrand(brand);
  });

  // label position controls (vertical, rotation, size) — drive the scene directly
  const DEFAULT_LABEL_ANGLE = 34; // degrees, applied to every preset
  const labelPos = { y: 0, angle: DEFAULT_LABEL_ANGLE * Math.PI / 180, scale: 1 };
  function labelSlider(label, min, max, step, value, unit, fmt, onInput) {
    const row = document.createElement('div');
    row.className = 'sl-row';
    row.innerHTML = '<div class="sl-head"><span class="sl-label">' + label + '</span><span class="sl-val mono"></span></div>' +
      '<input class="sl-input" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">';
    const inp = row.querySelector('input'), val = row.querySelector('.sl-val');
    const show = (v) => { val.textContent = fmt ? fmt(v) : (v + (unit || '')); };
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); show(v); onInput(v); });
    show(value);
    $('#label-controls').appendChild(row);
    return { set(v) { inp.value = v; show(v); } };
  }
  labelSlider('Label height', -18, 18, 1, 0, '%', (v) => v + '%', (v) => { labelPos.y = v / 100; if (sceneReady) window.SV.setLabelPos({ y: labelPos.y }); });
  const labelHeightSl2 = $('#label-controls').lastChild;
  const labelAngleSl = labelSlider('Label rotation', -180, 180, 2, DEFAULT_LABEL_ANGLE, '°', (v) => v + '°', (v) => { labelPos.angle = v * Math.PI / 180; if (sceneReady) window.SV.setLabelPos({ angle: labelPos.angle }); });
  const labelSizeSl = labelSlider('Label size', 60, 140, 1, 100, '%', (v) => v + '%', (v) => { labelPos.scale = v / 100; if (sceneReady) window.SV.setLabelPos({ scale: labelPos.scale }); });
  const labelHeightSl = { set(v) { const i = labelHeightSl2 && labelHeightSl2.querySelector('input'); if (i) { i.value = v; labelHeightSl2.querySelector('.sl-val').textContent = v + '%'; } } };

  // label colour — Auto (parametric, contrast-checked) or a chosen ink
  let labelColorOverride = null;
  const lcRow = document.createElement('div');
  lcRow.className = 'sl-row';
  lcRow.innerHTML = '<div class="sl-head"><span class="sl-label">Label colour</span>' +
    '<span class="lc-controls"><button class="lc-auto on" type="button">Auto</button>' +
    '<label class="lc-swatch" title="Pick ink"><input type="color" class="lc-pick" value="#1d3b63"></label></span></div>';
  $('#label-controls').appendChild(lcRow);
  const lcAuto = lcRow.querySelector('.lc-auto');
  const lcPick = lcRow.querySelector('.lc-pick');
  lcAuto.addEventListener('click', () => { labelColorOverride = null; lcAuto.classList.add('on'); if (sceneReady) window.SV.setLabelColor(null); });
  lcPick.addEventListener('input', () => { labelColorOverride = lcPick.value; lcAuto.classList.remove('on'); lcRow.querySelector('.lc-swatch').style.background = lcPick.value; if (sceneReady) window.SV.setLabelColor(lcPick.value); });

  // randomise — a plausible perfumer's accord
  $('#btn-random').addEventListener('click', function () {
    loadFormula(randomFormula());
  });

  // atomise — spray puff from the nozzle
  $('#btn-spray').addEventListener('click', function () {
    if (sceneReady) window.SV.spray();
  });

  // record turntable → WebM download
  $('#btn-record').addEventListener('click', function () {
    if (!sceneReady) return;
    const btn = this;
    btn.classList.add('on'); btn.textContent = 'Recording…';
    window.SV.recordTurntable((blob, err) => {
      btn.classList.remove('on'); btn.textContent = 'Record';
      if (err || !blob) { alert('Recording not supported in this browser.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = (brand || formulaName || 'scent-vessel').replace(/\s+/g, '-').toLowerCase() + '-turntable.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  });

  // ------------------------------------------------------------- compare shelf
  let shelf = [];
  try { shelf = JSON.parse(localStorage.getItem('sv-shelf') || '[]'); } catch (e) { shelf = []; }
  function saveShelf() { try { localStorage.setItem('sv-shelf', JSON.stringify(shelf)); } catch (e) {} }
  function renderShelf() {
    const el = $('#shelf');
    el.innerHTML = '';
    shelf.forEach((item, i) => {
      const d = document.createElement('div');
      d.className = 'shelf-item';
      d.innerHTML = '<img src="' + item.img + '" alt="' + item.name + '">' +
        '<div class="shelf-cap">' + item.name + '</div>' +
        '<button class="shelf-del" title="Remove">×</button>';
      d.addEventListener('click', (e) => {
        if (e.target.classList.contains('shelf-del')) { shelf.splice(i, 1); saveShelf(); renderShelf(); return; }
        loadFormula({ name: item.name, state: item.state });
        if (item.brand != null) { brand = item.brand; $('#brand-input').value = brand; if (sceneReady) window.SV.setBrand(brand); }
      });
      el.appendChild(d);
    });
  }
  $('#btn-pin').addEventListener('click', function () {
    if (!sceneReady) return;
    const img = window.SV.snapshot(220, 270);
    shelf.push({ name: (brand || formulaName || 'Untitled'), state: JSON.parse(JSON.stringify(state)), brand: brand, img: img });
    if (shelf.length > 12) shelf.shift();
    saveShelf(); renderShelf();
  });

  // ------------------------------------------------------------- spec sheet
  $('#btn-export').addEventListener('click', openSheet);
  $('#sheet-close').addEventListener('click', () => $('#sheet-overlay').classList.remove('open'));
  $('#sheet-print').addEventListener('click', () => window.print());

  // ------------------------------------------------------------- save / load
  function serializeDesign() {
    return {
      app: 'vessel', v: 1,
      brand: brand, formulaName: formulaName,
      state: state, cmf: cmf,
      labelPos: { y: labelPos.y, angle: labelPos.angle, scale: labelPos.scale },
      labelColor: labelColorOverride,
    };
  }
  function restoreDesign(o) {
    if (!o || !o.state) return false;
    state = JSON.parse(JSON.stringify(o.state));
    formulaName = o.formulaName || 'Loaded formula';
    brand = o.brand != null ? o.brand : formulaName;
    cmf = Object.assign({ chips: {}, chipNames: {}, mats: {}, finish: {}, dims: {} }, o.cmf || {});
    ['chips', 'chipNames', 'mats', 'finish', 'dims'].forEach((k) => { if (!cmf[k]) cmf[k] = {}; });
    $('#brand-input').value = brand;
    labelPos.y = o.labelPos && o.labelPos.y != null ? o.labelPos.y : 0;
    labelPos.angle = o.labelPos && o.labelPos.angle != null ? o.labelPos.angle : DEFAULT_LABEL_ANGLE * Math.PI / 180;
    labelPos.scale = o.labelPos && o.labelPos.scale != null ? o.labelPos.scale : 1;
    labelHeightSl.set(Math.round(labelPos.y * 100));
    labelAngleSl.set(Math.round(labelPos.angle * 180 / Math.PI));
    labelSizeSl.set(Math.round(labelPos.scale * 100));
    labelColorOverride = o.labelColor || null;
    if (lcAuto) lcAuto.classList.toggle('on', !labelColorOverride);
    dirty = true;
    syncAllInputs();
    if (sceneReady) { window.SV.setBrand(brand); window.SV.setLabelColor(labelColorOverride); window.SV.setLabelPos(labelPos); }
    recompute();
    if (sceneReady) window.SV.update(design, true);
    return true;
  }
  $('#btn-save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(serializeDesign(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (brand || formulaName || 'vessel').replace(/\s+/g, '-').toLowerCase() + '.vessel.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
  $('#btn-load').addEventListener('click', () => $('#file-load').click());
  $('#file-load').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    let obj = null;
    try { obj = JSON.parse(text); } catch (_) {
      const m = text.match(/<script[^>]*id=["']vessel-state["'][^>]*>([\s\S]*?)<\/script>/i);
      if (m) { try { obj = JSON.parse(m[1].trim()); } catch (_) {} }
    }
    if (!(obj && restoreDesign(obj))) alert('Could not read that file. Load a saved .vessel.json or an exported spec sheet (.html).');
    e.target.value = '';
  });
  // share — encode the full design into the URL hash and copy it
  $('#btn-share').addEventListener('click', async function () {
    const json = JSON.stringify(serializeDesign());
    const hash = '#d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
    const url = location.origin + location.pathname + hash;
    history.replaceState(null, '', hash);
    const btn = this, old = btn.textContent;
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Copied link'; }
    catch (_) { btn.textContent = 'Link in URL'; }
    setTimeout(() => { btn.textContent = old; }, 1600);
  });
  // hi-res PNG packshot
  $('#btn-png').addEventListener('click', function () {
    if (!sceneReady) return;
    const data = window.SV.exportPNG(2);
    const a = document.createElement('a');
    a.href = data; a.download = (brand || formulaName || 'vessel').replace(/\s+/g, '-').toLowerCase() + '-packshot.png';
    a.click();
  });
  $('#sheet-overlay').addEventListener('click', (e) => {
    if (e.target === $('#sheet-overlay')) $('#sheet-overlay').classList.remove('open');
  });

  function openSheet() {
    const d = design;
    const img = sceneReady ? window.SV.snapshot(820, 1040) : '';
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const famRows = d.ranked.filter((f) => f.share > 0.005).map((f) =>
      '<div class="sh-fam"><span class="sh-fam-name">' + f.label + '</span>' +
      '<span class="sh-fam-bar"><span style="width:' + Math.round(f.share * 100) + '%;background:' + f.tint + '"></span></span>' +
      '<span class="sh-fam-pct mono">' + Math.round(f.share * 100) + '%</span></div>'
    ).join('');

    $('#sheet').innerHTML =
      '<header class="sh-head">' +
        '<div><div class="sh-eyebrow mono">VESSEL — PRODUCT DEVELOPMENT SHEET</div>' +
        '<h1 class="sh-name">' + formulaName + (dirty ? ' (modified)' : '') + '</h1></div>' +
        '<div class="sh-meta mono">REF SV-' + String(Math.abs(hash(JSON.stringify(state))) % 900 + 100) + '<br>' + date + '<br>' + d.conc.label.toUpperCase() + ' · ' + d.conc.pct + '</div>' +
      '</header>' +
      '<div class="sh-grid">' +
        '<div class="sh-photo">' + (img ? '<img src="' + img + '" alt="Bottle render">' : '') +
          '<div class="sh-dims mono">H ' + d.dims.h + ' × W ' + d.dims.w + ' × D ' + d.dims.d + ' MM · WALL ' + d.dims.wall + ' MM · ' + d.dims.ml + ' ML · SECTION: ' + d.form.sectionName.toUpperCase() + '</div></div>' +
        '<div class="sh-data">' +
          '<div class="sh-sec"><div class="sh-sec-title mono">01 — OLFACTORY FORMULA</div>' + famRows + '</div>' +
          '<div class="sh-sec"><div class="sh-sec-title mono">02 — STRUCTURE</div>' +
            '<div class="sh-struct mono">TOP ' + Math.round(d.structure.top * 100) + '% · HEART ' + Math.round(d.structure.heart * 100) + '% · BASE ' + Math.round(d.structure.base * 100) + '%<br>LONGEVITY ' + state.longevity + ' H · SILLAGE ' + Math.round(state.sillage * 100) + '/100</div></div>' +
          '<div class="sh-sec"><div class="sh-sec-title mono">03 — CMF</div>' +
            '<div class="sh-chips">' + d.chips.map((c) => '<div class="sh-chip"><div class="sh-chip-sw" style="background:' + c.hex + '"></div><span>' + c.name + '</span><span class="mono">' + c.hex.toUpperCase() + '</span></div>').join('') + '</div>' +
            '<div class="sh-mats">' +
              shMat('GLASS', d.glassType) + shMat('CAP', d.cap.label) + shMat('COLLAR', d.collar.label) + shMat('ATOMISER', d.atomizer.label) +
            '</div></div>' +
        '</div>' +
      '</div>' +
      '</div>' +
      '<div class="sh-sec"><div class="sh-sec-title mono">05 — PACKAGING</div>' +
        cartonHTML(d) +
      '</div>' +
      '<div class="sh-sec sh-rationale"><div class="sh-sec-title mono">04 — FEATURES</div>' +
        design.rationale.map((r) => '<p><strong>' + r.title + '.</strong> ' + r.text + '</p>').join('') +
      '</div>' +
      '<footer class="sh-foot mono">GENERATED BY VESSEL · THE BOTTLE IS THE DATA · ' + date + '</footer>' +
      '<script type="application/json" id="vessel-state">' + JSON.stringify(serializeDesign()).replace(/</g, '\\u003c') + '<\/script>';
    $('#sheet-overlay').classList.add('open');
  }
  function shMat(k, v) {
    return '<div class="sh-mat"><span class="mono">' + k + '</span><span>' + v + '</span></div>';
  }
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h;
  }

  // ------------------------------------------------------------- tweaks bridge
  window.__svApplyTweaks = function (t) {
    if (!sceneReady) { window.__svPendingTweaks = t; return; }
    if (t.quality) window.SV.setQuality(t.quality.toLowerCase());
    if (t.turntableSpeed != null) window.SV.setTurntableSpeed(t.turntableSpeed);
    if (t.backdrop) window.SV.setBackdrop(t.backdrop);
    if (t.reliefDepth != null && window.SV.setReliefScale) window.SV.setReliefScale(t.reliefDepth);
    if (t.decor != null && window.SV.setDecor) window.SV.setDecor(t.decor);
    if (t.camera && window.SV.setCamera) window.SV.setCamera({ 'Hero 3/4': 'hero', 'Packshot': 'packshot', 'Macro': 'macro', 'Top-down': 'top' }[t.camera] || 'hero');
    if (t.surface && window.SV.setSurface) window.SV.setSurface(t.surface.toLowerCase());
  };

  // ------------------------------------------------------------- boot
  function onSceneReady() {
    sceneReady = true;
    if (brand) window.SV.setBrand(brand);
    window.SV.setLabelPos(labelPos);
    window.SV.update(design);
    if (window.__svPendingTweaks) window.__svApplyTweaks(window.__svPendingTweaks);
    // dismiss the loading page once the first bottle has painted
    requestAnimationFrame(() => setTimeout(() => {
      const ld = document.getElementById('sv-loading');
      if (ld) { ld.classList.add('hidden'); setTimeout(() => ld.remove(), 600); }
    }, 200));
  }
  if (window.SV) onSceneReady();
  else window.addEventListener('sv-ready', onSceneReady);

  brand = PRESETS[0].name;
  $('#brand-input').value = brand;
  renderShelf();
  // permalink: restore a shared design from the URL hash, if present
  (function () {
    const m = location.hash.match(/[#&]d=([^&]+)/);
    if (!m) return;
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (obj && obj.state) {
        state = JSON.parse(JSON.stringify(obj.state));
        formulaName = obj.formulaName || 'Shared formula';
        brand = obj.brand != null ? obj.brand : formulaName;
        cmf = Object.assign({ chips: {}, chipNames: {}, mats: {}, finish: {}, dims: {} }, obj.cmf || {});
        ['chips', 'chipNames', 'mats', 'finish', 'dims'].forEach((k) => { if (!cmf[k]) cmf[k] = {}; });
        $('#brand-input').value = brand;
        if (obj.labelPos) { labelPos.y = obj.labelPos.y || 0; labelPos.angle = obj.labelPos.angle != null ? obj.labelPos.angle : labelPos.angle; labelPos.scale = obj.labelPos.scale || 1; }
        labelColorOverride = obj.labelColor || null;
        dirty = true;
      }
    } catch (_) {}
  })();
  syncAllInputs();
  recompute();
})();
