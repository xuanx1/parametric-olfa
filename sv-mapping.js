// ============================================================================
// SCENT VESSEL — mapping engine
// Pure functions: fragrance formula  →  form / material / CMF / rationale.
// Exposed on window.SVM
// ============================================================================
(function () {
  'use strict';

  // -------------------------------------------------------------- families
  const FAMILIES = [
    { key: 'citrus',   label: 'Citrus',          tint: '#dde28a', juice: '#e9e07a', chip: 'Vert Limone' },
    { key: 'aquatic',  label: 'Green / Aquatic', tint: '#bfe0d4', juice: '#bfe0cf', chip: 'Eau Pâle' },
    { key: 'floral',   label: 'Floral',          tint: '#f0d4da', juice: '#f0cdd5', chip: 'Poudre Rose' },
    { key: 'fruity',   label: 'Fruity',          tint: '#f2b89c', juice: '#f0a986', chip: 'Solaire' },
    { key: 'spicy',    label: 'Spicy',           tint: '#c97c4a', juice: '#c06a36', chip: 'Terracotta Brûlée' },
    { key: 'woody',    label: 'Woody',           tint: '#a88058', juice: '#96693f', chip: 'Santal Fumé' },
    { key: 'amber',    label: 'Amber / Oriental',tint: '#b5762e', juice: '#a35f1d', chip: 'Ambre Profond' },
    { key: 'musk',     label: 'Musk',            tint: '#e2dacb', juice: '#e0d6c4', chip: 'Peau' },
    { key: 'gourmand', label: 'Gourmand',        tint: '#c69a66', juice: '#b8854c', chip: 'Caramel Lacté' },
  ];

  const CONCENTRATIONS = [
    { key: 'edc', label: 'Eau de Cologne',  short: 'EdC',     pct: '2–4%' },
    { key: 'edt', label: 'Eau de Toilette', short: 'EdT',     pct: '5–15%' },
    { key: 'edp', label: 'Eau de Parfum',   short: 'EdP',     pct: '15–20%' },
    { key: 'ext', label: 'Extrait',         short: 'Extrait', pct: '20–40%' },
  ];

  // ----------------------------------------------------------- color utils
  function hex2rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    const c = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  // weighted mix in gamma-ish space with slight linearization
  function mixHex(pairs) { // [[hex, w], ...]
    let r = 0, g = 0, b = 0, W = 0;
    for (const [h, w] of pairs) {
      if (w <= 0) continue;
      const [rr, gg, bb] = hex2rgb(h);
      r += rr * rr * w; g += gg * gg * w; b += bb * bb * w; W += w;
    }
    if (W === 0) return '#e8e8e8';
    return rgb2hex(Math.sqrt(r / W), Math.sqrt(g / W), Math.sqrt(b / W));
  }
  function towards(hex, target, t) {
    const a = hex2rgb(hex), c = hex2rgb(target);
    return rgb2hex(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t);
  }
  const lighten = (h, t) => towards(h, '#ffffff', t);
  const darken = (h, t) => towards(h, '#16140f', t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------- normalize
  function normalizeFamilies(fam) {
    const total = FAMILIES.reduce((s, f) => s + (fam[f.key] || 0), 0);
    const out = {};
    FAMILIES.forEach((f) => { out[f.key] = total > 0 ? (fam[f.key] || 0) / total : 1 / 9; });
    return { shares: out, total };
  }
  function normalizeStructure(st) {
    const total = st.top + st.heart + st.base;
    if (total <= 0) return { top: 1 / 3, heart: 1 / 3, base: 1 / 3 };
    return { top: st.top / total, heart: st.heart / total, base: st.base / total };
  }

  // ============================================================== DERIVE
  // state = { families:{citrus..gourmand: 0-100}, structure:{top,heart,base: 0-100},
  //           concentration: 0-3, longevity: 2-24 (h), sillage: 0-1 }
  function derive(state) {
    const { shares } = normalizeFamilies(state.families);
    const st = normalizeStructure(state.structure);
    const conc = CONCENTRATIONS[state.concentration];
    const concT = state.concentration / 3;               // 0..1
    const longevityT = clamp((state.longevity - 2) / 22, 0, 1);
    const sillage = clamp(state.sillage, 0, 1);

    // dominant family
    const ranked = FAMILIES.map((f) => ({ ...f, share: shares[f.key] }))
      .sort((a, b) => b.share - a.share);
    const dom = ranked[0];

    // ---- composite scores
    const fresh = shares.citrus + shares.aquatic;
    const warm = shares.amber + shares.gourmand + shares.spicy;
    const turbidity = clamp(shares.gourmand * 1.2 + shares.amber * 1.0 + shares.musk * 0.5 - fresh * 0.4, 0, 1);
    const facet = shares.citrus + shares.aquatic * 0.35;       // crisp facets
    const flute = shares.woody + shares.spicy * 0.45;          // vertical fluting
    const frost = shares.musk;                                  // matte frosted skin
    const fillet = shares.floral + shares.fruity * 0.5;        // soft fillets

    // ---- FORM ----------------------------------------------------------
    const topness = clamp(0.5 + (st.top - st.base) * 1.05, 0, 1); // 0 = base-heavy, 1 = top-heavy
    const aspect = lerp(0.78, 2.35, topness);                  // H : W
    const scale = lerp(1.0, 0.58, concT);                      // extrait = small + dense
    const W = 1.30 * scale * lerp(1.18, 0.66, topness);        // overall width (scene units)
    const H = W * aspect;
    const wall = lerp(0.035, 0.150, concT) * scale;            // glass wall (scene units)

    const baseSpread = lerp(0.78, 1.0, longevityT);            // footprint stability
    const shoulderFlare = lerp(0.86, 1.22, sillage);           // sillage → flare
    const shoulderY = lerp(0.58, 0.80, topness);               // top-heavy carries shoulders high
    const bellyY = lerp(0.42, 0.30, topness);

    // ---- CROSS-SECTION + ARCHITECTURE (the loft, not a revolve) ---------
    const facetAmt = clamp(shares.citrus * 1.9 + shares.spicy * 0.35 - shares.floral * 0.3, 0, 0.85);
    const facetN = shares.citrus >= shares.aquatic ? 6 : 8;
    const boxP = clamp(2.05 + shares.woody * 3.2 + shares.amber * 1.1 + shares.gourmand * 0.9 + longevityT * 0.5, 2.0, 5.2);
    const depthRatio = clamp(1.02 - (shares.floral * 1.1 + shares.fruity * 0.55 + shares.musk * 0.4 + shares.woody * 0.35 + shares.gourmand * 0.25), 0.42, 1.0);
    const twistDeg = Math.round(clamp(shares.spicy * 95, 0, 36));
    const bellyFull = 0.88 + st.heart * 0.28;                  // heart notes swell the waist
    const shoulderSquare = clamp(shares.woody * 1.3 + shares.amber * 0.5 + (st.base - st.top) * 0.5 + longevityT * 0.25, 0, 1) * 0.9;

    const form = {
      W, H, aspect, scale, wall,
      baseR: (W / 2) * baseSpread,
      bodyR: W / 2,
      shoulderR: (W / 2) * lerp(0.80, 0.97, topness * 0.4) * shoulderFlare,
      shoulderY, bellyY,
      neckR: clamp(W * 0.155, 0.085 * scale, 0.16),
      facetAmt, facetN,
      faceted: facetAmt > 0.45,
      boxP, depthRatio,
      twistDeg, twistRad: twistDeg * Math.PI / 180,
      bellyFull, shoulderSquare,
      fluteAmp: 0,
      fluteCount: 18,
      filletSoft: clamp(fillet, 0, 1),
      topness, longevityT, sillage, concT,
    };
    form.sectionName = sectionName(form);
    form._st = st;
    form.relief = reliefSpec(shares, form, frost);

    // ---- MATERIAL -------------------------------------------------------
    const tintPairs = FAMILIES.map((f) => [f.tint, shares[f.key]]);
    let tint = mixHex(tintPairs);
    tint = lighten(tint, lerp(0.14, 0.34, fresh));             // fresh = pale, but never invisible
    const juice = mixHex(FAMILIES.map((f) => [f.juice, shares[f.key]]));
    const glassRough = clamp(0.03 + frost * 0.62 + turbidity * 0.10, 0.03, 0.7);
    const attenuationDistance = lerp(1.25, 0.4, clamp(turbidity + concT * 0.35, 0, 1));

    const material = {
      tint, juice,
      glassRough,
      attenuationDistance,
      thickness: wall * 14,                                    // shader thickness
      opaline: turbidity > 0.45 && shares.gourmand > shares.amber,
      smoked: turbidity > 0.45 && shares.amber >= shares.gourmand,
      frosted: frost > 0.28,
      liquidLevel: lerp(0.86, 0.74, concT),
    };
    // ---- BODY MATERIAL (not always glass) ------------------------------
    // Strong, concentrated formulas can be cased in opaque materials the way
    // niche houses do; lighter/fresher ones stay glass.
    const bm = bodyMaterialOf(shares, dom, concT, material, juice, tint, warm, fresh);
    material.body = bm.type;
    material.bodyLabel = bm.label;
    material.bodyWhy = bm.why;
    material.bodyColor = bm.color;
    material.opaque = bm.opaque;
    // keep the legacy glass-finish booleans in sync with the chosen body
    material.frosted = bm.type === 'frosted';
    material.opaline = bm.type === 'opaline';
    material.smoked = bm.type === 'smoked';

    // ---- CAP / HARDWARE -------------------------------------------------
    const capGroups = [
      { score: shares.citrus + shares.aquatic, type: 'aluminium', label: 'Brushed aluminium', color: '#c9cccd', metal: 1.0, rough: 0.38,
        why: 'cool, technical metal answers the fresh ' + dom.label.toLowerCase() + ' opening' },
      { score: shares.floral + shares.musk, type: 'ceramic', label: 'Glazed ceramic', color: '#f3efe7', metal: 0.0, rough: 0.22,
        why: 'soft white ceramic carries the powdery, skin-like character' },
      { score: shares.woody + shares.spicy, type: 'wood', label: 'Turned walnut', color: '#6e4f33', metal: 0.0, rough: 0.62,
        why: 'turned timber states the woody-spicy core literally' },
      { score: shares.fruity + shares.amber + shares.gourmand, type: 'abs', label: 'Lacquered ABS', color: darken(juice, 0.55), metal: 0.0, rough: 0.10,
        why: 'deep wet-look lacquer in the juice tone for syrupy density' },
    ];
    const cap = capGroups.sort((a, b) => b.score - a.score)[0];
    // cap silhouette by dominant family (not just material)
    const capShapeMap = {
      citrus: 'jewel', aquatic: 'dome', floral: 'dome', fruity: 'sphere',
      spicy: 'column', woody: 'column', amber: 'jewel', musk: 'disc', gourmand: 'sphere',
    };
    cap.shape = capShapeMap[dom.key] || 'column';

    const collarWarm = warm > fresh;
    const collar = collarWarm
      ? { label: 'Galvanic brass, satin', color: '#b08d52', metal: 1.0, rough: 0.30, why: 'warm metal bridges the amber-leaning heart' }
      : { label: 'Polished chrome', color: '#d7dadc', metal: 1.0, rough: 0.10, why: 'bright chrome keeps the fresh families crisp' };

    const atomizer = state.concentration === 3
      ? { label: 'No atomiser — ground-glass dab stopper', why: 'extrait is applied by touch, not spray' }
      : { label: 'Standard 15 mm crimp pump, ' + (collarWarm ? 'brass' : 'chrome') + ' actuator', why: 'fine mist suits a ' + conc.short + ' strength' };

    // ---- GLASS / BODY TYPE ----------------------------------------------
    // The CMF "Body" callout simply reflects the chosen body material.
    const glassType = material.bodyLabel;
    const glassWhy = material.bodyWhy;

    // ---- FINISH SPEC ----------------------------------------------------
    const finishSpec = [];
    const bt = material.body;
    if (bt === 'frosted') finishSpec.push({ name: 'Frosted', target: 'body', why: 'musk at ' + pc(shares.musk) + ' — diffuse, tactile skin' });
    else if (bt === 'smoked') finishSpec.push({ name: 'Smoked', target: 'body', why: 'amber/oriental at ' + pc(shares.amber) + ' — graduated shadow in the mass' });
    else if (bt === 'opaline') finishSpec.push({ name: 'Opaline', target: 'body', why: 'gourmand at ' + pc(shares.gourmand) + ' — milk-glass turbidity' });
    else if (bt === 'wood') finishSpec.push({ name: 'Oiled, open-pore', target: 'body', why: 'turned timber casing for a woody extrait' });
    else if (bt === 'metal') finishSpec.push({ name: 'Anodised satin', target: 'body', why: 'technical metal body, no transparency' });
    else if (bt === 'ceramic') finishSpec.push({ name: shares.musk > shares.gourmand ? 'Matte bisque' : 'Soft-gloss glaze', target: 'body', why: 'ceramic casing for a soft, dense character' });
    else if (bt === 'lacquer') finishSpec.push({ name: 'High-gloss lacquer', target: 'body', why: 'opaque wet-look lacquer in the juice tone' });
    else finishSpec.push({ name: 'High gloss', target: 'body', why: 'fresh families at ' + pc(fresh) + ' — maximum clarity and sparkle' });

    finishSpec.push({
      name: cap.type === 'aluminium' ? 'Satin (linear brush)' : cap.type === 'abs' ? 'Wet gloss' : cap.type === 'wood' ? 'Oiled, open-pore' : 'Soft gloss glaze',
      target: 'cap', why: cap.why,
    });
    finishSpec.push({ name: collarWarm ? 'Satin' : 'Mirror polish', target: 'collar', why: collar.why });

    // ---- CHIPS ----------------------------------------------------------
    const second = ranked[1];
    const chips = [
      { name: dom.chip, hex: juice, role: 'Juice' },
      { name: 'Verre ' + dom.chip.split(' ')[0], hex: tint, role: 'Glass tint' },
      { name: cap.label.split(' ')[0] === 'Lacquered' ? 'Laque ' + second.chip.split(' ')[0] : cap.label, hex: cap.color, role: 'Cap' },
      { name: collar.label.split(',')[0], hex: collar.color, role: 'Collar' },
      { name: 'Ombre ' + (collarWarm ? 'Chaude' : 'Froide'), hex: darken(juice, 0.72), role: 'Shadow accent' },
    ];

    // ---- pseudo-real dimensions ----------------------------------------
    const mm = 78;                                            // scene unit → mm
    const wx = 1 / Math.sqrt(form.depthRatio);                // flat bottles widen in X
    const dims = {
      h: Math.round(H * mm + 28 * scale),                     // incl. hardware
      w: Math.round(W * mm * wx),
      d: Math.round(W * mm * form.depthRatio * wx),
      wall: (wall * mm).toFixed(1),
      ml: Math.round(clamp(Math.PI * Math.pow((W / 2) * 0.82, 2) * H * 0.62 * form.depthRatio * mm * mm * mm / 1000, 7, 220) / 5) * 5,
    };

    // ---- RATIONALE ------------------------------------------------------
    const decor = decorSpec(shares, ranked, st, concT, frost, juice);
    const label = labelSpec(dom, shares, material, juice, fresh, warm, decor);
    finishSpec.push({ name: decor.label, target: 'print', why: 'Murano decoration led by the ' + decor.domKey + ' note' });
    const rationale = [
      {
        region: 'silhouette', title: 'Silhouette',
        text: st.top >= st.base
          ? `Top notes lead the structure at ${pc(st.top)} — the body stretches to a ${aspect.toFixed(2)} : 1 aspect, slender and vertical.`
          : `Base notes anchor the structure at ${pc(st.base)} — the mass settles low and wide at ${aspect.toFixed(2)} : 1, heavy through the shoulders.`,
      },
      {
        region: 'section', title: 'Cross-section',
        text: sectionSentence(form, shares, st),
      },
      {
        region: 'shoulder', title: 'Shoulder',
        text: sillage > 0.55
          ? `Sillage is projected (${Math.round(sillage * 100)}/100) — the shoulders flare ${Math.round((shoulderFlare - 1) * 100 + 14)}% past the waist, pushing the form outward the way the scent fills a room.`
          : `Sillage stays intimate (${Math.round(sillage * 100)}/100) — the shoulders draw inward, keeping the silhouette close to the body.`,
      },
      {
        region: 'base', title: 'Base',
        text: `${state.longevity} h longevity sets the footprint: ${longevityT > 0.5 ? 'a full, planted base — the bottle is built to stay put, like the drydown' : 'a lighter, narrower stance for a scent that lifts off early'} (base spread ${Math.round(baseSpread * 100)}%).`,
      },
      {
        region: 'walls', title: 'Glass mass',
        text: `${conc.label} (${conc.pct} oils) → ${dims.wall} mm walls at ${Math.round(scale * 100)}% scale. ${concT > 0.6 ? 'Extrait logic: small, dense, jewel-like — material in place of volume.' : concT < 0.3 ? 'Cologne logic: thin walls, generous volume, made to be used freely.' : 'Mid-weight glass balances presence and pour.'}`,
      },
      {
        region: 'surface', title: 'Surface & tint',
        text: surfaceSentence(dom, shares, material, fresh) + reliefSentence(form, shares) + decorSentence(decor),
      },
    ];

    return {
      shares, structure: st, conc, dom, ranked,
      form, material, decor, label,
      cap, collar, atomizer, glassType, glassWhy,
      finishSpec, chips, dims, rationale,
    };
  }

  function pc(x) { return Math.round(x * 100) + '%'; }

  // ---- body material: glass by default, opaque casings for strong scents
  function bodyMaterialOf(shares, dom, concT, material, juice, tint, warm, fresh) {
    if (material.frosted) return { type: 'frosted', label: 'Acid-etched glass', why: 'musk dominance reads as a matte, skin-like frosted surface', color: lighten(tint, 0.34), opaque: false };
    if (material.opaline) return { type: 'opaline', label: 'Opaline cased glass', why: 'gourmand creaminess turns the glass milky and dense', color: '#f0e8d8', opaque: false };
    if (material.smoked) return { type: 'smoked', label: 'Smoked glass', why: 'amber depth calls for a body that holds shadow', color: darken(tint, 0.35), opaque: false };
    // opaque casings only for concentrated (EdP / Extrait) statements
    if (concT >= 0.5) {
      if (dom.key === 'woody') return { type: 'wood', label: 'Turned ' + (warm > fresh ? 'walnut' : 'ash'), why: 'a woody extrait is cased in turned timber, not glass', color: warm > fresh ? '#6e4f33' : '#b39b6e', opaque: true };
      if (dom.key === 'musk') return { type: 'ceramic', label: 'Matte bisque ceramic', why: 'musk wants a soft, unglazed ceramic skin', color: lighten(tint, 0.3), opaque: true };
      if (dom.key === 'amber' || dom.key === 'spicy') return { type: 'lacquer', label: 'Lacquered metal', why: 'a deep wet-look lacquer in the juice tone for an oriental', color: darken(juice, 0.32), opaque: true };
      if ((dom.key === 'aquatic' || dom.key === 'citrus') && concT >= 0.66) return { type: 'metal', label: 'Anodised aluminium', why: 'a technical anodised metal body for a concentrated fresh', color: warm > fresh ? '#b9a05c' : '#a7afb3', opaque: true };
      if (dom.key === 'gourmand') return { type: 'ceramic', label: 'Glazed ceramic', why: 'a glazed ceramic body for a rich gourmand', color: lighten(juice, 0.4), opaque: true };
    }
    return { type: fresh > 0.45 ? 'glass' : 'glass', label: fresh > 0.45 ? 'Extra-clear low-iron glass' : 'Tinted flint glass', why: fresh > 0.45 ? 'a fresh formula should read water-clear' : "the blend carries a visible tint", color: tint, opaque: false };
  }

  // ---- Venetian printed decoration: technique + Murano palette ---------
  function decorSpec(shares, ranked, st, concT, frost, juice) {
    const VC = {
      citrus: '#e0b400', aquatic: '#1f7fa8', floral: '#b23a6e', fruity: '#cf4326',
      spicy: '#c2552a', woody: '#1f6b4d', amber: '#b8761f', musk: '#6c6f86', gourmand: '#7a3b8c',
    };
    const dom = ranked[0], second = ranked[1], third = ranked[2];
    const colors = [VC[dom.key], VC[second.key], VC[third.key]];
    const fresh = shares.citrus + shares.aquatic;
    const warm = shares.amber + shares.gourmand + shares.spicy;
    const gold = warm >= fresh ? '#c9a24a' : '#cdbf95';

    let motif, label;
    if (dom.key === 'floral' || (dom.key === 'fruity' && second.key === 'floral')) { motif = 'millefiori'; label = 'Millefiori mosaic'; }
    else if (dom.key === 'woody') { motif = 'latticino'; label = 'Latticino canes'; }
    else if (dom.key === 'amber' || dom.key === 'spicy') { motif = concT > 0.55 ? 'arabesque' : 'goldleaf'; label = concT > 0.55 ? 'Gilt arabesque' : 'Gold-leaf bands'; }
    else if (dom.key === 'gourmand') { motif = 'trailed'; label = 'Trailed threads'; }
    else if (dom.key === 'musk') { motif = 'reticello'; label = 'Reticello net'; }
    else if (dom.key === 'fruity') { motif = 'trailed'; label = 'Trailed threads'; }
    else { motif = 'filigrana'; label = 'Filigrana stripes'; } // citrus / aquatic / fresh

    const density = Math.round(lerp(18, 40, concT) + st.top * 6);
    const repeat = (motif === 'filigrana' || motif === 'latticino' || motif === 'reticello') ? 3 : 2;
    const metallic = (motif === 'goldleaf' || motif === 'arabesque') ? 0.72 : motif === 'reticello' ? 0.5 : 0.32;
    return { motif, colors, gold, density, repeat, metallic, label, domKey: dom.key };
  }

  // ---- parametric label ink + typography from the formula -------------
  function labelSpec(dom, shares, material, juice, fresh, warm, decor) {
    // Effective background the label sits over. Opaline & frosted glass render
    // milky-pale regardless of juice; clear/tinted glass shows the juice through
    // the tint at the filled belly where the label lands.
    let bg;
    if (material.opaque) bg = material.bodyColor || material.tint;
    else if (material.opaline) bg = '#efe7d8';
    else if (material.frosted) bg = lighten(material.tint, 0.5);
    else bg = mixHex([[juice, 0.66], [material.tint, 0.34]]);
    const bgL = relLum(bg);
    const darkBg = bgL < 0.42 && !material.opaline && !material.frosted;

    // candidate parametric ink — family-flavoured
    let ink, foil = false;
    if (warm >= fresh && darkBg) { ink = decor.gold; foil = true; }     // warm + dark → gold candidate (contrast check flips to cream if it fails)
    else if (warm >= fresh) { ink = darken(decor.gold, 0.35); foil = true; } // warm + light → deep bronze foil
    else if (fresh > 0.45) { ink = '#1d3b63'; }                          // fresh → cool navy
    else if (dom.key === 'floral') { ink = '#7a2342'; }                  // floral → burgundy
    else { ink = darken(juice, 0.55); }                                  // else deep juice ink

    // CONTRAST GUARANTEE: the ink must read against the glass. If the
    // parametric pick is too close in luminance, swap to the light/dark
    // variant on the opposite side of the background — keeping warm/cool feel.
    const MIN = 3.0;
    if (contrast(ink, bg) < MIN) {
      if (foil && darkBg) {
        // brighten the gold before abandoning the foil look
        const lifted = lighten(decor.gold, 0.28);
        ink = contrast(lifted, bg) >= MIN ? lifted : '#f1e7cd';
      } else {
        const lightInk = warm >= fresh ? '#f1e7cd' : '#f4f2ec';            // cream / warm cream
        const darkInk = warm >= fresh ? '#34230f' : fresh > 0.45 ? '#0f2236' : dom.key === 'floral' ? '#33101c' : '#1b1813';
        ink = bgL > 0.45 ? darkInk : lightInk;
        foil = warm >= fresh && bgL <= 0.45;
      }
      // last-resort hard guarantee
      if (contrast(ink, bg) < 2.4) { ink = bgL > 0.5 ? '#111111' : '#ffffff'; foil = false; }
    }
    let font, fontName;
    if (dom.key === 'floral' || dom.key === 'amber' || dom.key === 'gourmand') { font = 'Georgia, "Times New Roman", serif'; fontName = 'High-contrast serif'; }
    else if (dom.key === 'aquatic' || dom.key === 'citrus' || dom.key === 'musk') { font = '"IBM Plex Mono", ui-monospace, monospace'; fontName = 'Mono grotesque'; }
    else { font = 'Archivo, "Helvetica Neue", sans-serif'; fontName = 'Grotesque sans'; }

    // carton foil: contrast against the BOARD (glass-tint) colour, not the juice
    const board = material.tint, boardL = relLum(board);
    let cartonInk = ink;
    if (contrast(cartonInk, board) < 3.0) {
      cartonInk = boardL > 0.5
        ? (warm >= fresh ? '#5c4416' : '#1b1813')
        : (warm >= fresh ? decor.gold : '#f4f2ec');
      if (contrast(cartonInk, board) < 2.4) cartonInk = boardL > 0.5 ? '#111111' : '#ffffff';
    }
    return { ink, foil, font, fontName, cartonInk, contrast: +contrast(ink, bg).toFixed(2) };
  }
  function hex2rgbArr(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function relLum(hex) {
    const c = hex2rgbArr(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const la = relLum(a), lb = relLum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  function decorSentence(dec) {
    if (!dec || dec.motif === 'none') return '';
    const map = {
      millefiori: ' printed with a millefiori mosaic of cane flowers',
      latticino: ' wrapped in twisted latticino canes',
      arabesque: ' banded with a gilt arabesque scroll',
      goldleaf: ' laid with gold-leaf bands and aventurine fleck',
      trailed: ' wound with trailed glass threads',
      reticello: ' netted in a fine reticello of crossed threads',
      filigrana: ' striped with filigrana canes',
    };
    return '. Decoration:' + (map[dec.motif] || '') + ', Murano-style.';
  }

  // ---- parametric surface relief: pick a motif from the formula --------
  // Each family proposes a SET of motifs; the winner's variant is chosen by
  // structure (top/heart/base) and the second-strongest family, so two scents
  // in the same family rarely land on the same pattern. Counts are derived
  // from structure + concentration so frequency varies too.
  function reliefSpec(shares, f, frost) {
    if (f.faceted) return { motif: 'none', amp: 0, label: 'Brilliant gem facets' };
    const st = f._st || { top: 0.34, heart: 0.33, base: 0.33 };

    // dominant decorative family
    const drivers = [
      { fam: 'woody',    score: shares.woody * 1.5 + shares.spicy * 0.12 },
      { fam: 'citrus',   score: shares.citrus * 1.3 },
      { fam: 'amber',    score: shares.amber * 1.35 + shares.fruity * 0.2 },
      { fam: 'aquatic',  score: shares.aquatic * 1.6 },
      { fam: 'gourmand', score: shares.gourmand * 1.4 + shares.fruity * 0.45 },
      { fam: 'floral',   score: shares.floral * 1.45 },
      { fam: 'spicy',    score: shares.spicy * 1.55 },
      { fam: 'musk',     score: shares.musk * 1.2 },
    ].sort((a, b) => b.score - a.score);
    const win = drivers[0], second = drivers[1].fam;
    if (win.score < 0.16) return { motif: 'none', amp: 0, label: 'Plain glass' };

    // structure picks a variant within the family (0=top-led,1=heart-led,2=base-led)
    const led = st.top >= st.heart && st.top >= st.base ? 0 : st.base >= st.heart ? 2 : 1;
    // counts modulated by concentration (denser juice → finer relief) + structure
    const fine = Math.round(lerp(10, 26, f.concT) + st.top * 8);
    const med = Math.round(lerp(8, 18, f.concT));
    const bands = Math.round(lerp(5, 16, 1 - f.topness) + (1 - f.concT) * 4);

    // [motif, label, ribCount, bandCount]
    const PALETTE = {
      woody: [
        led === 2 ? ['flute', 'Vertical fluting', fine, 0]
                  : ['reed', 'Tight reeding', fine + 6, 0],
        ['bark', 'Riven bark striae', fine + 4, 0],
        ['basketweave', 'Basketweave', med, Math.max(6, bands)],
      ],
      citrus: [
        led === 0 ? ['prism', 'Prismatic cut', fine + 4, 0]
                  : ['facetrib', 'Brilliant ribs', fine + 8, 0],
        ['sunburst', 'Sunburst flutes', fine + 2, 0],
        ['crosshatch', 'Crosshatch engraving', med, Math.max(8, bands)],
      ],
      amber: [
        ['gadroon', 'Gadrooned bands', 0, Math.max(5, bands - 1)],
        ['tier', 'Stepped tiers', 0, Math.max(4, bands - 2)],
        ['cabochon', 'Cabochon bosses', Math.max(6, med - 2), Math.max(5, bands - 1)],
      ],
      aquatic: [
        ['ripple', 'Aqueous ripple', 0, bands + 6],
        ['wave', 'Undulating wave', 0, bands + 3],
        ['scale', 'Imbricated scales', med, Math.max(7, bands)],
      ],
      gourmand: [
        ['quilt', 'Diamond quilt', med, Math.max(7, bands)],
        ['cabochon', 'Cabochon bosses', Math.max(7, med - 1), Math.max(6, bands)],
        ['honeycomb', 'Honeycomb', med + 2, Math.max(7, bands)],
      ],
      floral: [
        ['guilloche', 'Guilloché', fine + 6, Math.max(6, bands)],
        ['scale', 'Petal imbrication', med, Math.max(8, bands)],
        ['lattice', 'Woven lattice', med, Math.max(6, bands)],
      ],
      spicy: [
        led === 0 ? ['chevron', 'Chevron herringbone', med + 2, Math.max(6, bands)]
                  : ['diagonal', 'Diagonal ribbing', fine, Math.max(5, bands)],
        ['lattice', 'Woven lattice', med, Math.max(6, bands)],
        ['guilloche', 'Spiced guilloché', fine + 2, Math.max(6, bands)],
      ],
      musk: [
        ['dimple', 'Soft dimpling', med + 4, bands + 5],
        ['pinstripe', 'Fine pinstripe', fine + 10, 0],
        ['honeycomb', 'Faint honeycomb', med, Math.max(7, bands)],
      ],
    };
    const set = PALETTE[win.fam];
    // secondary family nudges which variant (0/1/2) we take
    const secIdx = ({ woody: 1, citrus: 1, amber: 2, aquatic: 1, gourmand: 2, floral: 1, spicy: 2, musk: 0 })[second] || 0;
    const pick = set[(led + secIdx) % set.length];

    const amp = lerp(0.024, 0.09, clamp((win.score - 0.16) / 0.6, 0, 1)) * (frost > 0.28 ? 0.7 : 1);
    const twistable = ['flute', 'reed', 'diagonal', 'prism', 'sunburst', 'pinstripe', 'bark'];
    const twist = twistable.indexOf(pick[0]) >= 0 ? f.twistRad / Math.PI : 0;
    const count = pick[2] || pick[3];
    return {
      motif: pick[0], ribCount: pick[2], bandCount: pick[3],
      amp, twist, score: win.score, fam: win.fam,
      label: pick[1] + (count ? ' ×' + count : ''),
    };
  }

  function sectionName(f) {
    if (f.facetAmt > 0.45) return f.twistDeg > 10 ? `Twisted gem · ${f.facetN}-cut` : `Gem-cut · ${f.facetN} facets`;
    if (f.depthRatio < 0.6) return f.boxP > 3.2 ? 'Architectural slab' : 'Soft flacon slab';
    if (f.boxP > 3.4) return 'Square column';
    if (f.fluteAmp > 0) return 'Fluted round';
    if (f.depthRatio < 0.85) return 'Pebble lens';
    return 'Soft round';
  }

  function sectionSentence(f, shares, st) {
    const depthPc = Math.round(f.depthRatio * 100);
    if (f.facetAmt > 0.45) {
      return `Citrus at ${pc(shares.citrus)} cuts the section into a hard ${f.facetN}-facet gem${f.twistDeg > 8 ? `, torqued ${f.twistDeg}° up the height by the spice` : ''} — light breaks on every edge.`;
    }
    if (f.depthRatio < 0.6) {
      return `Florals and skin notes flatten the body to ${depthPc}% depth — a slab flacon made to face forward${f.boxP > 3.2 ? ', squared off by the woods' : ', with soft pillowed faces'}.`;
    }
    if (f.boxP > 3.4) {
      return `Woods at ${pc(shares.woody)} square the section toward an architectural column${f.fluteAmp > 0 ? ', carved with vertical flutes' : ''}${f.twistDeg > 8 ? `, twisted ${f.twistDeg}° by the spice` : ''}.`;
    }
    if (f.fluteAmp > 0) {
      return `Woody notes carve ${f.fluteCount} vertical flutes around the section, like sawn grain${f.twistDeg > 8 ? `, spiralled ${f.twistDeg}° by the spice` : ''}.`;
    }
    if (f.twistDeg > 8) {
      return `Spice at ${pc(shares.spicy)} torques the section ${f.twistDeg}° from base to neck — a slow turn you read in the highlights.`;
    }
    if (f.depthRatio < 0.85) {
      return `The blend eases the section into a pebble lens at ${depthPc}% depth — rounded in the hand, slim on the shelf.`;
    }
    return `A balanced blend keeps the section quietly circular — nothing in the formula forces an edge.`;
  }

  function surfaceSentence(dom, shares, m, fresh) {
    let treat;
    if (m.frosted) treat = `Musk at ${pc(shares.musk)} frosts the skin matte — light lands, it doesn't bounce.`;
    else if (m.smoked) treat = `The skin stays glossy but the mass runs smoked and deep.`;
    else if (m.opaline) treat = `The glass turns opaline, almost edible — a soft-gloss milk skin.`;
    else if (fresh > 0.45) treat = `High-polish skin over water-clear glass — maximum sparkle for the fresh opening.`;
    else treat = `A quiet gloss skin; the tint blends the formula's families by weight.`;
    return treat;
  }

  function reliefSentence(f, shares) {
    const r = f.relief;
    if (!r || r.motif === 'none') {
      return f.faceted ? ' The cut facets are the pattern — no applied relief.' : ' The body stays plain; nothing dominant enough to press a pattern.';
    }
    const famPc = pc(shares[r.fam] || 0);
    const cap = (r.fam || 'the blend').charAt(0).toUpperCase() + (r.fam || '').slice(1);
    const map = {
      flute: ` presses ${r.ribCount} vertical flutes into the wall.`,
      reed: ` draws the wall into ${r.ribCount} tight convex reeds.`,
      facetrib: ` scores ${r.ribCount} brilliant ribs around the body.`,
      prism: ` cuts ${r.ribCount} asymmetric prismatic facets that throw the light sideways.`,
      bark: ` rives the surface into irregular vertical striae, like split timber.`,
      sunburst: ` fans ${r.ribCount} flutes outward from the base in a sunburst.`,
      pinstripe: ` rules ${r.ribCount} fine pinstripes around the skin.`,
      gadroon: ` swells the wall into ${r.bandCount} gadrooned bands.`,
      ripple: ` chases a fine horizontal ripple up the glass.`,
      wave: ` lets the bands undulate in a slow horizontal wave.`,
      tier: ` stacks the body into ${r.bandCount} stepped tiers.`,
      quilt: ` quilts the surface into a soft diamond grid.`,
      crosshatch: ` engraves a crisp crosshatch across the body.`,
      honeycomb: ` cells the surface into a faint honeycomb.`,
      basketweave: ` interlaces the wall into a basketweave.`,
      scale: ` overlaps the surface in imbricated scales.`,
      cabochon: ` raises a field of rounded cabochon bosses.`,
      dimple: ` pebbles the skin with staggered soft dimpling.`,
      diagonal: ` shears the ribbing diagonally up the height.`,
      chevron: ` folds the ribs into a chevron herringbone.`,
      guilloche: ` engraves a rose-engine guilloché across the body.`,
      lattice: ` weaves a diagonal lattice into the glass.`,
    };
    return map[r.motif] ? ` ${cap} at ${famPc}${map[r.motif]}` : '';
  }

  // ---------------------------------------------------------------- PRESETS
  const PRESETS = [
    {
      key: 'spice', name: 'Spicy Oriental', sub: 'spicy oriental',
      state: {
        families: { citrus: 2, aquatic: 0, floral: 13, fruity: 2, spicy: 41, woody: 14, amber: 17, musk: 0, gourmand: 10 },
        structure: { top: 18, heart: 36, base: 47 }, concentration: 2, longevity: 14, sillage: 0.69,
      },
    },
    {
      key: 'riviera', name: 'Cologne Riviera', sub: 'citrus cologne',
      state: {
        families: { citrus: 55, aquatic: 22, floral: 8, fruity: 4, spicy: 3, woody: 8, amber: 0, musk: 0, gourmand: 0 },
        structure: { top: 58, heart: 28, base: 14 }, concentration: 0, longevity: 3, sillage: 0.35,
      },
    },
    {
      key: 'blanc', name: 'Blanc Absolu', sub: 'white floral',
      state: {
        families: { citrus: 6, aquatic: 8, floral: 52, fruity: 9, spicy: 0, woody: 8, amber: 0, musk: 14, gourmand: 3 },
        structure: { top: 24, heart: 52, base: 24 }, concentration: 2, longevity: 8, sillage: 0.62,
      },
    },
    {
      key: 'oud', name: 'Oud Royale', sub: 'oud amber',
      state: {
        families: { citrus: 0, aquatic: 0, floral: 8, fruity: 0, spicy: 15, woody: 36, amber: 29, musk: 8, gourmand: 4 },
        structure: { top: 10, heart: 28, base: 62 }, concentration: 3, longevity: 18, sillage: 0.82,
      },
    },
    {
      key: 'creme', name: 'Crème Noire', sub: 'vanilla gourmand',
      state: {
        families: { citrus: 0, aquatic: 0, floral: 6, fruity: 10, spicy: 6, woody: 8, amber: 18, musk: 10, gourmand: 42 },
        structure: { top: 12, heart: 34, base: 54 }, concentration: 2, longevity: 12, sillage: 0.68,
      },
    },
    {
      key: 'vetiver', name: 'Vert Vetiver', sub: 'green vetiver',
      state: {
        families: { citrus: 14, aquatic: 18, floral: 6, fruity: 4, spicy: 6, woody: 40, amber: 4, musk: 8, gourmand: 0 },
        structure: { top: 34, heart: 30, base: 36 }, concentration: 1, longevity: 7, sillage: 0.5,
      },
    },
    {
      key: 'azur', name: 'Bleu Azur', sub: 'aquatic musk',
      state: {
        families: { citrus: 16, aquatic: 40, floral: 8, fruity: 6, spicy: 2, woody: 8, amber: 0, musk: 20, gourmand: 0 },
        structure: { top: 44, heart: 30, base: 26 }, concentration: 1, longevity: 6, sillage: 0.45,
      },
    },
  ];

  // ---------------------------------------------------------- ACCORD GENERATOR
  // Generates a plausible, balanced formula around a randomly chosen archetype
  // (not pure noise) so the result reads as a real scent family.
  const ACCORDS = [
    { name: 'citrus cologne',  base: { citrus: 50, aquatic: 22, woody: 10, floral: 8, musk: 6 },  struct: [58, 28, 14], conc: [0, 1], life: [3, 6], sill: [0.3, 0.5] },
    { name: 'white floral',    base: { floral: 50, fruity: 10, musk: 14, aquatic: 8, woody: 8 },  struct: [26, 50, 24], conc: [1, 2], life: [7, 11], sill: [0.5, 0.7] },
    { name: 'oud amber',       base: { woody: 34, amber: 28, spicy: 14, musk: 8, floral: 6 },      struct: [10, 28, 62], conc: [2, 3], life: [14, 22], sill: [0.7, 0.9] },
    { name: 'vanilla gourmand',base: { gourmand: 42, amber: 16, fruity: 10, musk: 10, woody: 8 }, struct: [14, 34, 52], conc: [2, 2], life: [10, 16], sill: [0.55, 0.75] },
    { name: 'green vetiver',   base: { woody: 38, aquatic: 18, citrus: 14, spicy: 8, musk: 8 },    struct: [34, 30, 36], conc: [1, 2], life: [6, 10], sill: [0.4, 0.6] },
    { name: 'aquatic musk',    base: { aquatic: 40, citrus: 16, musk: 20, floral: 8, woody: 8 },   struct: [44, 30, 26], conc: [0, 1], life: [5, 8], sill: [0.35, 0.55] },
    { name: 'spicy oriental',  base: { spicy: 30, amber: 22, woody: 16, floral: 10, gourmand: 8 }, struct: [16, 40, 44], conc: [2, 3], life: [12, 20], sill: [0.65, 0.85] },
    { name: 'fruity chypre',   base: { fruity: 30, floral: 18, woody: 16, citrus: 12, musk: 8 },   struct: [40, 34, 26], conc: [1, 2], life: [6, 10], sill: [0.45, 0.65] },
  ];
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function jitter(v, amt) { return Math.max(0, Math.round(v * (1 - amt + Math.random() * amt * 2))); }
  function randomFormula() {
    const a = ACCORDS[Math.floor(Math.random() * ACCORDS.length)];
    const families = {};
    FAMILIES.forEach((f) => { families[f.key] = a.base[f.key] ? jitter(a.base[f.key], 0.32) : (Math.random() < 0.25 ? randInt(0, 4) : 0); });
    const s = a.struct.map((v) => jitter(v, 0.22));
    return {
      name: a.name.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      sub: a.name,
      state: {
        families,
        structure: { top: s[0], heart: s[1], base: s[2] },
        concentration: randInt(a.conc[0], a.conc[1]),
        longevity: randInt(a.life[0], a.life[1]),
        sillage: +(a.sill[0] + Math.random() * (a.sill[1] - a.sill[0])).toFixed(2),
      },
    };
  }

  window.SVM = { FAMILIES, CONCENTRATIONS, PRESETS, derive, randomFormula, normalizeFamilies, normalizeStructure, mixHex, lighten, darken };
})();
