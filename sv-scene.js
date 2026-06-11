// ============================================================================
// SCENT VESSEL — studio scene (Three.js, ES module)  · v2 loft engine
// The bottle is a LOFT of a morphing cross-section, not a simple revolve:
//   · vertical profile  = top/heart/base curve  ⊕  square-shoulder slab blend
//   · cross-section     = superellipse ↔ N-gon gem blend, depth-squashed,
//                         twisted, fluted — all derived from the formula
// Exposes window.SV and fires 'sv-ready' on window.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ACCENT = 0xe8501a;

const container = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcdc9c1);

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
camera.position.set(3.1, 1.65, 5.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.55;
controls.enablePan = false;
controls.target.set(0, 0.85, 0);

// environment: a custom studio equirect — mid-grey sweep with bright softbox
// strips so clear glass catches specular highlights and refracts visible
// structure (a smooth backdrop alone leaves transmissive glass invisible).
const pmrem = new THREE.PMREMGenerator(renderer);
function makeStudioEnv() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#ffffff');     // overhead diffusion
  g.addColorStop(0.42, '#dedbd4');
  g.addColorStop(0.62, '#bdb9b0');    // horizon
  g.addColorStop(1.0, '#7d7a72');     // floor falloff
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  function softbox(cx, w, top, h, intensity) {
    const grad = x.createLinearGradient(cx - w, 0, cx + w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${intensity})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad; x.fillRect(cx - w, top, 2 * w, h);
  }
  softbox(1024 * 0.16, 110, 10, 490, 1.25);   // big key, front-left
  softbox(1024 * 0.70, 78, 30, 450, 0.92);    // fill, front-right
  softbox(1024 * 0.93, 50, 50, 400, 0.7);     // rim, back
  softbox(1024 * 0.40, 30, 80, 330, 0.55);    // catch-strip for edge definition
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const _envTex = makeStudioEnv();
scene.environment = pmrem.fromEquirectangular(_envTex).texture;
_envTex.dispose();

// ------------------------------------------------------------------ lights
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(3.4, 6.2, 3.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 20;
key.shadow.camera.left = -4; key.shadow.camera.right = 4;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
key.shadow.radius = 18;
key.shadow.blurSamples = 16;
key.shadow.bias = -0.0004;
scene.add(key);

const fill = new THREE.DirectionalLight(0xeef0f5, 0.55);
fill.position.set(-4.5, 2.2, 1.5);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 1.15);
rim.position.set(-1.5, 4.0, -5.5);
scene.add(rim);

// -------------------------------------------------------------- cyclorama
// vertical studio sweep: darker at the top so clear glass reads against it,
// lifting to a lighter floor where soft shadow grounds the bottle.
let backdropTone = new THREE.Color(0xcdc9c1);
function backdropGradient(base) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const x = c.getContext('2d');
  const top = base.clone().multiplyScalar(0.62);
  const bot = base.clone().multiplyScalar(1.06);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#' + top.getHexString());
  g.addColorStop(0.62, '#' + base.getHexString());
  g.addColorStop(1, '#' + bot.clone().lerp(new THREE.Color(0xffffff), 0.08).getHexString());
  x.fillStyle = g; x.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeCyclorama() {
  const geo = new THREE.PlaneGeometry(60, 44, 2, 96);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < -4) {
      const t = Math.min((-4 - z) / 16, 1);
      pos.setY(i, t * t * 22);
    }
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: backdropGradient(backdropTone), roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
let surfaceName = 'sweep';
// procedural studio surfaces tinted by the current backdrop tone
function surfaceTexture(name, base) {
  if (name === 'sweep') return { map: backdropGradient(base), rough: 0.97, repeat: 1 };
  const S = 512, c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  const hex = (col) => '#' + col.getHexString();
  x.fillStyle = hex(base); x.fillRect(0, 0, S, S);
  if (name === 'marble') {
    x.fillStyle = '#eceae6'; x.fillRect(0, 0, S, S);            // pale stone, not tinted dark
    // bold primary veins
    for (let i = 0; i < 9; i++) {
      x.strokeStyle = 'rgba(54,52,58,' + (0.45 + Math.random() * 0.35) + ')';
      x.lineWidth = 1.5 + Math.random() * 3;
      x.beginPath();
      let px = Math.random() * S, py = -10; x.moveTo(px, py);
      while (py < S) { px += (Math.random() - 0.5) * 130; py += 26 + Math.random() * 30; x.lineTo(px, py); }
      x.stroke();
    }
    // fine secondary veins
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = 'rgba(90,86,92,' + (0.18 + Math.random() * 0.2) + ')';
      x.lineWidth = 0.6 + Math.random();
      x.beginPath();
      let px = Math.random() * S, py = -10; x.moveTo(px, py);
      while (py < S) { px += (Math.random() - 0.5) * 90; py += 20 + Math.random() * 20; x.lineTo(px, py); }
      x.stroke();
    }
    return { map: finishTex(c), rough: 0.16, repeat: 14 };
  }
  if (name === 'linen') {
    x.fillStyle = hex(base.clone().lerp(new THREE.Color(0xffffff), 0.18)); x.fillRect(0, 0, S, S);
    const cell = 14;
    for (let y = 0; y < S; y += cell) {
      for (let x0 = 0; x0 < S; x0 += cell) {
        const over = ((x0 / cell) + (y / cell)) % 2 === 0;
        // warp / weft threads with clear shading
        x.fillStyle = over ? 'rgba(255,255,255,0.5)' : 'rgba(70,64,54,0.32)';
        x.fillRect(x0, y, cell, cell / 2);
        x.fillStyle = over ? 'rgba(70,64,54,0.32)' : 'rgba(255,255,255,0.5)';
        x.fillRect(x0, y + cell / 2, cell, cell / 2);
      }
    }
    return { map: finishTex(c), rough: 0.95, repeat: 26 };
  }
  if (name === 'concrete') {
    x.fillStyle = hex(base.clone().lerp(new THREE.Color(0x8d8a84), 0.5)); x.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {                              // soft blotches
      const r = 30 + Math.random() * 90, cx = Math.random() * S, cy = Math.random() * S;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const dark = Math.random() > 0.5;
      g.addColorStop(0, 'rgba(' + (dark ? '40,38,36' : '220,218,214') + ',' + (0.06 + Math.random() * 0.1) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    }
    for (let i = 0; i < 9000; i++) {                            // grit speckle
      x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.12) + ')';
      x.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
    }
    return { map: finishTex(c), rough: 0.82, repeat: 9 };
  }
  return { map: backdropGradient(base), rough: 0.97, repeat: 1 };
}
function finishTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function applyBackdrop() {
  scene.background.copy(backdropTone).multiplyScalar(0.82);
  const s = surfaceTexture(surfaceName, backdropTone);
  cyc.material.map?.dispose();
  cyc.material.map = s.map;
  if (s.repeat > 1) s.map.repeat.set(s.repeat, s.repeat);
  cyc.material.roughness = s.rough;
  cyc.material.metalness = surfaceName === 'marble' ? 0.0 : 0;
  cyc.material.needsUpdate = true;
}
const cyc = makeCyclorama();
scene.add(cyc);

// ------------------------------------------------------------ procedural maps
function brushedTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * 256;
    x.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 40},${Math.random() > 0.5 ? 255 : 40},${Math.random() > 0.5 ? 255 : 40},0.05)`;
    x.beginPath(); x.moveTo(0, y); x.lineTo(256, y + (Math.random() - 0.5) * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function woodTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#7a5836'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const y = i * 3 + Math.random() * 3;
    x.strokeStyle = `rgba(${30 + Math.random() * 40},${18 + Math.random() * 25},8,${0.12 + Math.random() * 0.25})`;
    x.lineWidth = 0.8 + Math.random() * 2.2;
    x.beginPath();
    for (let px = 0; px <= 256; px += 16) {
      const py = y + Math.sin(px * 0.04 + i) * 2.5;
      px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const TEX = { brushed: brushedTexture(), wood: woodTexture() };

// soft round sprite for the atomiser mist
const MIST_TEX = (function () {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  return t;
})();

// ============================================================ VENETIAN DECOR
// Procedural Murano-style printed decoration drawn onto a transparent canvas,
// mapped over a thin shell wrapped on the glass. spec = { motif, colors[],
// gold, density }. Transparent where unpainted so the glass shows through.
function makeDecorTexture(spec) {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  const col = spec.colors && spec.colors.length ? spec.colors : ['#1c4fa0'];
  const gold = spec.gold || '#c9a24b';
  const lattimo = 'rgba(247,244,236,0.92)';
  const D = spec.density || 28;
  const pick = (i) => col[((i % col.length) + col.length) % col.length];
  let rng = 1337;
  const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

  function vthread(px, w, color, alpha) {
    x.strokeStyle = color; x.globalAlpha = alpha; x.lineWidth = w; x.lineCap = 'round';
    x.beginPath(); x.moveTo(px, -4); x.lineTo(px, S + 4); x.stroke();
  }
  function diag(slope, gap, color, w, alpha) {
    x.save(); x.strokeStyle = color; x.globalAlpha = alpha; x.lineWidth = w;
    for (let k = -S; k < S * 2; k += gap) {
      x.beginPath(); x.moveTo(k, 0); x.lineTo(k + slope * S, S); x.stroke();
    }
    x.restore();
  }
  function murrina(cx, cy, r, base) {
    const rings = 3 + Math.floor(rnd() * 2);
    for (let i = rings; i >= 1; i--) {
      x.globalAlpha = 0.95; x.fillStyle = i % 2 ? pick(base + i) : lattimo;
      x.beginPath(); x.arc(cx, cy, r * i / rings, 0, TAU); x.fill();
    }
    const petals = 6 + Math.floor(rnd() * 4);
    x.fillStyle = gold; x.globalAlpha = 0.9;
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * TAU, rr = r * 0.62;
      x.beginPath(); x.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, r * 0.16, 0, TAU); x.fill();
    }
    x.fillStyle = pick(base); x.globalAlpha = 1;
    x.beginPath(); x.arc(cx, cy, r * 0.16, 0, TAU); x.fill();
  }

  switch (spec.motif) {
    case 'filigrana': {
      const n = Math.max(10, Math.round(D));
      for (let i = 0; i < n; i++) {
        const px = (i + 0.5) * S / n;
        vthread(px, S / n * 0.34, pick(i), 0.9);
        vthread(px + S / n * 0.5, S / n * 0.16, lattimo, 0.85);
      }
      break;
    }
    case 'latticino': {
      diag(0.5, S / Math.max(8, D), pick(0), S / D * 0.28, 0.85);
      diag(0.5, S / Math.max(8, D), lattimo, S / D * 0.12, 0.8);
      diag(-0.5, S / Math.max(8, D), gold, S / D * 0.10, 0.7);
      break;
    }
    case 'reticello': {
      const g = S / Math.max(8, D);
      diag(0.8, g, lattimo, 2.4, 0.8);
      diag(-0.8, g, lattimo, 2.4, 0.8);
      x.fillStyle = gold; x.globalAlpha = 0.75;
      for (let a = 0; a < S; a += g) for (let b = 0; b < S; b += g) {
        x.beginPath(); x.arc(a, b, 2.2, 0, TAU); x.fill();
      }
      break;
    }
    case 'millefiori': {
      const g = S / Math.max(4, Math.round(D / 4));
      for (let a = g * 0.5; a < S; a += g) for (let b = g * 0.5; b < S; b += g) {
        const jx = (rnd() - 0.5) * g * 0.5, jy = (rnd() - 0.5) * g * 0.5;
        murrina(a + jx, b + jy, g * (0.26 + rnd() * 0.12), Math.floor(rnd() * col.length));
      }
      break;
    }
    case 'goldleaf': {
      const n = Math.max(3, Math.round(D / 5));
      for (let i = 0; i < n; i++) {
        const cy = (i + 0.5) * S / n, h = S / n * (0.18 + rnd() * 0.12);
        x.fillStyle = gold; x.globalAlpha = 0.8; x.fillRect(0, cy - h / 2, S, h);
        x.fillStyle = pick(i); x.globalAlpha = 0.5; x.fillRect(0, cy - h / 2, S, h * 0.18);
      }
      x.fillStyle = gold; x.globalAlpha = 0.9;
      for (let i = 0; i < 900; i++) { x.fillRect(rnd() * S, rnd() * S, 2, 2); }
      break;
    }
    case 'trailed': {
      const n = Math.max(6, Math.round(D));
      for (let i = 0; i < n; i++) {
        const cy = (i + 0.5) * S / n;
        x.strokeStyle = i % 2 ? gold : pick(i); x.globalAlpha = 0.85; x.lineWidth = S / n * 0.22; x.lineCap = 'round';
        x.beginPath();
        for (let px = 0; px <= S; px += 16) {
          const py = cy + Math.sin(px * 0.04 + i) * S / n * 0.28;
          px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.stroke();
      }
      break;
    }
    case 'arabesque': {
      x.strokeStyle = gold; x.lineWidth = 5; x.globalAlpha = 0.9; x.lineCap = 'round';
      const band = S * 0.5, n = Math.max(4, Math.round(D / 3));
      for (let i = 0; i < n; i++) {
        const cx0 = i * S / n;
        x.beginPath();
        x.moveTo(cx0, band);
        x.bezierCurveTo(cx0 + S / n * 0.25, band - S * 0.16, cx0 + S / n * 0.75, band + S * 0.16, cx0 + S / n, band);
        x.stroke();
        x.beginPath(); x.arc(cx0 + S / n * 0.5, band, S * 0.045, 0, TAU * 0.8); x.stroke();
      }
      x.fillStyle = pick(0); x.globalAlpha = 0.6;
      for (let i = 0; i < n; i++) { x.beginPath(); x.arc((i + 0.5) * S / n, band, 6, 0, TAU); x.fill(); }
      break;
    }
    default: break;
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Acid-etched front label: brand name + note list, white frosted lettering.
function makeLabelTexture(brand, notes, opts) {
  opts = opts || {};
  const ink = opts.ink || '#f4f1e8';
  const font = opts.font || 'Archivo, sans-serif';
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = ink;
  x.strokeStyle = ink;
  // hairline rules
  x.lineWidth = 2.5; x.globalAlpha = 0.75;
  x.beginPath(); x.moveTo(W * 0.2, H * 0.32); x.lineTo(W * 0.8, H * 0.32); x.stroke();
  x.beginPath(); x.moveTo(W * 0.2, H * 0.70); x.lineTo(W * 0.8, H * 0.70); x.stroke();
  x.globalAlpha = 1;
  // brand
  const name = (brand || '').toUpperCase().slice(0, 18);
  const weight = font.indexOf('serif') >= 0 ? '600' : '700';
  let fs = 96; x.font = `${weight} ${fs}px ${font}`;
  while (x.measureText(name).width > W * 0.74 && fs > 28) { fs -= 4; x.font = `${weight} ${fs}px ${font}`; }
  x.fillText(spaced(name, 0.08), W / 2, H * 0.55);
  // notes line
  x.font = '500 30px "IBM Plex Mono", monospace';
  x.globalAlpha = 0.85;
  x.fillText(spaced((notes || '').toUpperCase(), 0.16), W / 2, H * 0.84);
  // top mark
  x.font = '500 26px "IBM Plex Mono", monospace';
  x.fillText('PARFUM', W / 2, H * 0.20);
  x.globalAlpha = 1;
  function spaced(s, em) { return s.split('').join(String.fromCharCode(8202).repeat(Math.round(em * 6))); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ============================================================ LOFT ENGINE
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// polar radius of the morphing cross-section (unit scale)
function sectionRho(theta, p, facetAmt, facetN, fluteAmp, fluteCount) {
  const c = Math.abs(Math.cos(theta)), s = Math.abs(Math.sin(theta));
  let rho = Math.pow(Math.pow(c, p) + Math.pow(s, p), -1 / p); // superellipse
  if (facetAmt > 0.001) {
    const a = Math.PI / facetN;
    let th = theta % (2 * a); if (th < 0) th += 2 * a;
    const rPoly = Math.cos(a) / Math.cos(th - a);              // regular N-gon
    rho = rho * (1 - facetAmt) + rPoly * facetAmt;
  }
  if (fluteAmp > 0.0001) rho *= 1 + Math.cos(theta * fluteCount) * fluteAmp;
  return rho;
}

// ----- parametric surface relief (the glass PATTERN), radial height field
// Returns an absolute radial offset (scene units) for a point on the body.
let reliefScale = 1;
let decorScale = 1;
let decoRef = null;
let brandName = '';
let labelInkOverride = null;
let labelYOff = 0, labelAngleOff = 0, labelScale = 1;
let liqRef = null, liqFill = 1;
let sprayGroup = null, sprayT = 0;
let nozzlePos = new THREE.Vector3(0, 2, 0);
const TAU = Math.PI * 2;
// waveform helpers (all return roughly [-1, 1])
const _frac = (x) => x - Math.floor(x);
const _tri = (x) => Math.abs(_frac(x / TAU) * 2 - 1) * 2 - 1;          // triangle
const _saw = (x) => _frac(x / TAU) * 2 - 1;                            // sawtooth
const _bump = (x) => { const c = Math.cos(x); return c > 0 ? c * c : -c * c * 0.35; }; // rounded boss
function reliefField(theta, yN, R, p) {
  if (!p || p.amp <= 0) return 0;
  const N = p.ribCount, M = p.bandCount;
  const tw = (p.twist || 0) * yN * TAU;
  const th = theta + tw;
  const vy = yN * M * TAU;
  let d = 0;
  switch (p.motif) {
    // ---- vertical families
    case 'flute':      d = -0.5 * (1 - Math.cos(th * N)); break;                 // concave round channels
    case 'reed':       d = -Math.pow(Math.abs(Math.sin(th * N / 2)), 0.6); break; // tight convex reeding
    case 'facetrib':   d = _tri(th * N); break;                                  // crisp triangular ridges
    case 'prism':      d = _saw(th * N); break;                                  // asymmetric knife facets
    case 'pinstripe':  d = 0.7 * Math.sin(th * N) + 0.3 * Math.sin(th * N * 3); break; // fine alternating lines
    case 'bark':       d = 0.6 * Math.cos(th * N) + 0.3 * Math.cos(th * N * 2.3 + 1.1)
                           + 0.18 * Math.sin(th * N * 5.1) + 0.12 * Math.sin(yN * 26 + th * 6); break; // irregular striae
    case 'sunburst':   d = Math.cos(th * N * (1 - 0.45 * yN)); break;            // flutes fanning from the base
    // ---- horizontal families
    case 'gadroon':    d = -0.5 * (1 - Math.cos(vy)); break;                     // rounded horizontal swags
    case 'ripple':     d = 0.5 * Math.cos(vy); break;                            // fine horizontal ripple
    case 'wave':       d = 0.5 * Math.cos(vy + 0.7 * Math.sin(th * 3)); break;   // undulating horizontal
    case 'tier':       d = -Math.max(0, _saw(vy)); break;                        // stacked stepped tiers
    // ---- grid / cellular families
    case 'quilt':      d = Math.cos(th * N) * Math.cos(vy); break;               // diamond pillows
    case 'crosshatch': d = 0.5 * (_tri(th * N) + _tri(vy)); break;               // engraved grid
    case 'honeycomb':  d = (Math.cos(th * N) + Math.cos(th * N * 0.5 + vy) + Math.cos(th * N * 0.5 - vy)) / 3; break;
    case 'basketweave': {
      const a = Math.cos(th * N) * (Math.sin(vy) > 0 ? 1 : 0.2);
      const b = Math.cos(vy) * (Math.sin(th * N) > 0 ? 1 : 0.2);
      d = 0.6 * (a + b); break;                                                  // interlaced over/under
    }
    case 'scale': {                                                              // fish-scale imbrication
      const stagger = (Math.floor(yN * M) % 2) * Math.PI;
      d = _bump(th * N + stagger) * (0.5 + 0.5 * Math.cos(vy)) - 0.3; break;
    }
    case 'cabochon':   d = _bump(th * N) * _bump(vy); break;                     // large rounded bosses
    case 'dimple': {                                                             // staggered soft pebbles
      const stagger = (Math.floor(yN * M) % 2) * Math.PI;
      d = Math.cos(th * N + stagger) * Math.cos(vy); break;
    }
    // ---- diagonal / engine families
    case 'diagonal':   d = Math.cos(th * N + vy); break;                         // sheared ribbing
    case 'chevron':    d = Math.cos(th * N + 2.3 * _tri(vy)); break;             // herringbone V
    case 'guilloche':  d = 0.55 * Math.sin(th * N + vy)
                           + 0.3 * Math.sin(th * Math.round(N * 0.6) - vy * 1.3)
                           + 0.15 * Math.sin(th * Math.round(N * 1.7) + vy * 0.5); break; // rose-engine
    case 'lattice':    d = Math.cos(th * N + vy) * Math.cos(th * N - vy); break; // woven diagonal lattice
    default: return 0;
  }
  return d * p.amp * R * reliefScale;
}

// Build a lofted BufferGeometry.
// rFn(y) → nominal radius. sec = {p, facetAmt, facetN, depth, twistRad,
// fluteAmp, fluteCount}. neckBlend morphs the section back to a circle near
// the neck so collar/cap hardware always seats on a round opening.
function buildLoft(rFn, o) {
  const { y0, y1, H, rows, cols, sec } = o;
  const rOff = o.rOff || 0;
  const verts = [];
  const uvs = o.uv ? [] : null;
  const ringStart = [];
  const relief = (o.relief && !o.flat) ? o.relief : null;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = lerp(y0, y1, t);
    const r = Math.max(rFn(y) + rOff, 0.004);
    const yN = y / H;
    const nb = o.neckBlend ? sstep((y / H - 0.80) / 0.16) : 0;
    const p = lerp(sec.p, 2, nb);
    const fa = sec.facetAmt * (1 - nb);
    const depth = lerp(sec.depth, 1, nb);
    const wx = 1 / Math.sqrt(depth);
    const fl = (sec.fluteAmp || 0) * (1 - sstep((y / H - 0.70) / 0.20));
    const tw = (sec.twistRad || 0) * (y / H);
    // relief fades in off the base and out before the neck
    const reliefFade = relief ? sstep((yN - 0.04) / 0.10) * (1 - sstep((yN - 0.70) / 0.16)) * (1 - nb) : 0;
    ringStart.push(verts.length / 3);
    for (let j = 0; j < cols; j++) {
      const theta = (j / cols) * Math.PI * 2 + Math.PI / (sec.facetN || 6) + tw;
      const rho = sectionRho(theta, p, fa, sec.facetN || 6, fl, sec.fluteCount || 16);
      const base = rho * r;
      const off = relief ? reliefField(theta, yN, r, relief) * reliefFade : 0;
      const Rr = base + off;
      verts.push(Math.cos(theta) * Rr * wx, y, Math.sin(theta) * Rr * depth * wx);
      if (uvs) uvs.push(j / cols, yN);
    }
  }
  const idx = [];
  for (let i = 0; i < rows; i++) {
    const a0 = ringStart[i], a1 = ringStart[i + 1];
    for (let j = 0; j < cols; j++) {
      const jn = (j + 1) % cols;
      idx.push(a0 + j, a1 + j, a0 + jn, a0 + jn, a1 + j, a1 + jn);
    }
  }
  // bottom / top fans
  if (o.closeBottom) {
    const c0 = verts.length / 3;
    verts.push(0, y0 + 0.002, 0);
    if (uvs) uvs.push(0.5, 0);
    for (let j = 0; j < cols; j++) idx.push(c0, ringStart[0] + j, ringStart[0] + (j + 1) % cols);
  }
  if (o.closeTop) {
    const cN = verts.length / 3;
    verts.push(0, y1 - 0.001, 0);
    if (uvs) uvs.push(0.5, 1);
    const last = ringStart[rows];
    for (let j = 0; j < cols; j++) idx.push(cN, last + (j + 1) % cols, last + j);
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  if (o.flat) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

// vertical profile: blend of a curvy Catmull profile (top/heart/base driven)
// and a straight-walled, square-shouldered slab profile (woods / base-heavy)
function makeProfile(f) {
  const H = f.H;
  const belly = f.bodyR * (f.bellyFull || 1);
  const ctrl = [
    new THREE.Vector3(f.baseR * 0.985, H * 0.015, 0),
    new THREE.Vector3(f.baseR, H * 0.05, 0),
    new THREE.Vector3(belly, H * f.bellyY, 0),
    new THREE.Vector3(f.shoulderR, H * f.shoulderY, 0),
    new THREE.Vector3(Math.max(f.neckR * 1.55, f.shoulderR * 0.42), H * 0.92, 0),
    new THREE.Vector3(f.neckR, H * 0.975, 0),
    new THREE.Vector3(f.neckR, H, 0),
  ];
  const tension = 0.05 + f.filletSoft * 0.55;
  const pts = new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', tension).getPoints(180);
  const curvy = (y) => {
    if (y <= pts[0].y) return pts[0].x;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y >= y) {
        const a = pts[i - 1], b = pts[i];
        const t = (y - a.y) / Math.max(b.y - a.y, 1e-6);
        return lerp(a.x, b.x, clamp(t, 0, 1));
      }
    }
    return pts[pts.length - 1].x;
  };
  const shMax = Math.max(belly, f.shoulderR);
  const shY = f.shoulderY;
  const slab = (y) => {
    const t = y / H;
    if (t < 0.03) return lerp(f.baseR * 0.94, f.baseR, t / 0.03);
    if (t < shY) return lerp(f.baseR, shMax, Math.pow((t - 0.03) / (shY - 0.03), 0.85));
    if (t < 0.96) {
      const u = (t - shY) / (0.96 - shY);
      return f.neckR + (shMax - f.neckR) * Math.pow(1 - u, 2.6);
    }
    return f.neckR;
  };
  const sq = f.shoulderSquare || 0;
  return (y) => {
    const r = lerp(curvy(y), slab(y), sq);
    return y / H > 0.955 ? f.neckR : r;
  };
}

const QUALITY = {
  draft:    { pr: 1, rows: 56, cols: 72, shadow: 1024 },
  studio:   { pr: Math.min(devicePixelRatio, 1.75), rows: 100, cols: 128, shadow: 2048 },
  showroom: { pr: Math.min(devicePixelRatio, 2.5), rows: 150, cols: 200, shadow: 2048 },
};
let quality = QUALITY.studio;

// ------------------------------------------------------------- bottle group
const bottle = new THREE.Group();
scene.add(bottle);
let disposables = [];
let capGroup = null, capLift = 0, capLiftTarget = 0, capBaseY = 0;
let overlays = {};
let currentDesign = null;
let bodyTopY = 1.6;

function track(...objs) { disposables.push(...objs); return objs[0]; }
function clearBottle() {
  while (bottle.children.length) bottle.remove(bottle.children[0]);
  disposables.forEach((d) => { if (d.geometry) d.geometry.dispose(); if (d.material) d.material.dispose?.(); });
  disposables = [];
  overlays = {};
  capGroup = null;
  liqRef = null;
  sprayGroup = null;
}

// ----------------------------------------------------------------- build
function buildBottle(d, animateFill) {
  clearBottle();
  currentDesign = d;
  const f = d.form, m = d.material;
  const prism = f.faceted;                       // hard gem-cut mode
  const rel = f.relief && f.relief.amp > 0 ? f.relief : null;
  const sec = {
    p: f.boxP, facetAmt: f.facetAmt, facetN: f.facetN, depth: f.depthRatio,
    twistRad: f.twistRad, fluteAmp: prism ? 0 : f.fluteAmp, fluteCount: f.fluteCount,
  };
  // relief needs angular + vertical resolution to read crisply
  let rows = prism ? Math.max(40, Math.round(quality.rows * 0.5)) : quality.rows;
  let cols = prism ? f.facetN : quality.cols;
  if (rel) {
    cols = Math.min(Math.max(cols, (rel.ribCount || 0) * 7), 360);
    rows = Math.min(Math.max(rows, (rel.bandCount || 0) * 10), 240);
  }
  const rFn = makeProfile(f);
  bodyTopY = f.H;

  // --- glass body
  const bodyGeo = buildLoft(rFn, {
    y0: 0, y1: f.H, H: f.H, rows, cols, sec, relief: rel,
    neckBlend: true, closeBottom: true, flat: prism,
  });
  // --- body: glass by default; opaque casings for metal / wood / ceramic / lacquer
  const bt = m.body || 'glass';
  const opaqueBody = bt === 'metal' || bt === 'wood' || bt === 'ceramic' || bt === 'lacquer';
  let bodyMat;
  if (bt === 'metal') {
    bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(m.bodyColor), metalness: 1.0, roughness: 0.34, roughnessMap: TEX.brushed, envMapIntensity: 1.4 });
  } else if (bt === 'wood') {
    bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(m.bodyColor), metalness: 0, roughness: 0.55, map: TEX.wood, envMapIntensity: 0.7 });
  } else if (bt === 'ceramic') {
    const matte = (m.bodyLabel || '').toLowerCase().indexOf('matte') >= 0 || (m.bodyLabel || '').toLowerCase().indexOf('bisque') >= 0;
    bodyMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(m.bodyColor), metalness: 0, roughness: matte ? 0.72 : 0.3, clearcoat: matte ? 0 : 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.9 });
  } else if (bt === 'lacquer') {
    bodyMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(m.bodyColor), metalness: 0.1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 });
  } else {
    bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transmission: 1, transparent: true, thickness: m.thickness,
      roughness: m.glassRough, metalness: 0, ior: 1.5,
      attenuationColor: new THREE.Color(m.tint), attenuationDistance: m.attenuationDistance,
      specularIntensity: 1, clearcoat: bt === 'frosted' ? 0 : 0.55, clearcoatRoughness: 0.12, envMapIntensity: 1.5,
    });
    if (bt === 'opaline') { bodyMat.transmission = 0.72; bodyMat.color.set(0xf6f1e6); bodyMat.roughness = Math.max(bodyMat.roughness, 0.22); }
    if (bt === 'smoked') { bodyMat.attenuationColor = new THREE.Color(m.bodyColor); bodyMat.attenuationDistance = Math.min(bodyMat.attenuationDistance, 0.5); }
    if (bt === 'frosted') {
      bodyMat.transmission = 0.5; bodyMat.roughness = Math.max(bodyMat.roughness, 0.62); bodyMat.clearcoat = 0;
      bodyMat.color.lerp(new THREE.Color(0xffffff), 0.35); bodyMat.attenuationDistance = Math.max(bodyMat.attenuationDistance, 0.9); bodyMat.ior = 1.46;
    }
  }
  const body = track(new THREE.Mesh(bodyGeo, bodyMat));
  body.castShadow = true;
  bottle.add(body);

  // --- Venetian printed decoration (thin shell wrapped on the glass) ---
  const dec = d.decor;
  if (dec && dec.motif && dec.motif !== 'none') {
    const decTex = makeDecorTexture(dec);
    decTex.repeat.set(dec.repeat || 1, 1);
    const decoGeo = buildLoft(rFn, {
      y0: 0, y1: f.H, H: f.H, rows, cols, sec, relief: rel,
      rOff: f.wall * 0.18 + 0.004, neckBlend: true, flat: prism, uv: true,
    });
    const decoMat = new THREE.MeshPhysicalMaterial({
      map: decTex,
      transparent: true,
      alphaTest: 0.04,
      opacity: decorScale,
      roughness: 0.32,
      metalness: dec.metallic != null ? dec.metallic : 0.35,   // gilding catches light
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.2,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const deco = track(new THREE.Mesh(decoGeo, decoMat));
    deco.renderOrder = 3;
    deco.visible = decorScale > 0.02;
    decoRef = deco;
    bottle.add(deco);
  }

  // --- liquid (same loft, inset by the wall) — only for see-through bodies
  const fillTop = f.H * m.liquidLevel * 0.9;
  if (!opaqueBody && fillTop > f.wall * 3) {
    const liqGeo = buildLoft(rFn, {
      y0: f.wall * 1.5, y1: fillTop, H: f.H, rows: Math.max(24, Math.round(rows * 0.7)), cols, sec,
      rOff: -f.wall * 1.6, neckBlend: true, closeBottom: true, closeTop: true, flat: prism,
    });
    const liqMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(m.juice),
      transmission: 0.92,
      transparent: true,
      roughness: 0.12,
      thickness: 0.6,
      ior: 1.36,
      attenuationColor: new THREE.Color(m.juice),
      attenuationDistance: Math.max(m.attenuationDistance * 0.5, 0.18),
    });
    const liqMesh = track(new THREE.Mesh(liqGeo, liqMat));
    liqMesh.geometry.translate(0, -f.wall * 1.5, 0);
    liqMesh.position.y = f.wall * 1.5;
    liqRef = liqMesh;
    if (animateFill) { liqMesh.scale.y = 0.02; liqFill = 0.02; }
    else { liqFill = 1; liqMesh.scale.y = 1; }
    bottle.add(liqMesh);
  }

  // --- collar
  const collarMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(d.collar.color), metalness: d.collar.metal, roughness: d.collar.rough,
  });
  const collarH = 0.07 * (0.7 + f.scale * 0.45);
  const collar = track(new THREE.Mesh(new THREE.CylinderGeometry(f.neckR * 1.12, f.neckR * 1.18, collarH, 48), collarMat));
  collar.position.y = f.H + collarH / 2 - 0.005;
  collar.castShadow = true;
  bottle.add(collar);

  // --- atomiser or dab stopper
  const isExtrait = d.atomizer.label.indexOf('dab') >= 0;
  const hwGroup = new THREE.Group();
  if (!isExtrait) {
    const stem = track(new THREE.Mesh(new THREE.CylinderGeometry(f.neckR * 0.22, f.neckR * 0.22, 0.10, 24),
      new THREE.MeshStandardMaterial({ color: 0xdadcde, metalness: 0.9, roughness: 0.25 })));
    stem.position.y = f.H + collarH + 0.045;
    const act = track(new THREE.Mesh(new THREE.CylinderGeometry(f.neckR * 0.62, f.neckR * 0.66, 0.085, 32), collarMat));
    act.position.y = f.H + collarH + 0.115;
    hwGroup.add(stem, act);
  } else {
    const stop = track(new THREE.Mesh(new THREE.SphereGeometry(f.neckR * 0.92, 32, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.55, thickness: 0.4, transparent: true })));
    stop.scale.y = 0.7;
    stop.position.y = f.H + collarH + f.neckR * 0.4;
    hwGroup.add(stop);
  }
  bottle.add(hwGroup);
  nozzlePos.set(0, f.H + collarH + (isExtrait ? f.neckR * 0.4 : 0.16), 0);

  // --- cap (echoes the bottle's cross-section: slab bottle → slab cap)
  capGroup = new THREE.Group();
  const capR = Math.min(Math.max(f.neckR * 2.05, 0.16 * f.scale), Math.max(f.shoulderR, f.bodyR) * 0.92);
  // cap silhouette by family: jewel (faceted gem), dome, sphere, column, disc
  const capShape = d.cap.shape || 'column';
  let capH = (0.16 + f.H * 0.13) * (d.cap.type === 'wood' ? 1.18 : 1);
  if (capShape === 'disc') capH *= 0.55;
  else if (capShape === 'column') capH *= 1.5;
  else if (capShape === 'sphere' || capShape === 'dome') capH *= 1.05;
  let capMat;
  if (d.cap.type === 'aluminium') {
    capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.cap.color), metalness: 1, roughness: 0.42, roughnessMap: TEX.brushed });
  } else if (d.cap.type === 'wood') {
    capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.cap.color), metalness: 0, roughness: 0.6, map: TEX.wood });
  } else if (d.cap.type === 'ceramic') {
    capMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(d.cap.color), metalness: 0, roughness: 0.24, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  } else {
    capMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(d.cap.color), metalness: 0, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 });
  }
  // profile per shape
  const capRFn = (y) => {
    const t = clamp(y / capH, 0, 1);
    switch (capShape) {
      case 'dome':   return capR * Math.sqrt(Math.max(0.0001, 1 - t * t * 0.92));         // hemispherical top
      case 'sphere': return capR * Math.sin(Math.max(0.04, t) * Math.PI) * 0.92 + capR * 0.12; // bulging orb
      case 'jewel':  return capR * (t < 0.5 ? 0.7 + 0.6 * t : 1.0 - 0.78 * (t - 0.5)) ;   // faceted brilliant (wide girdle, tapered crown)
      case 'disc':   { const u = sstep((t - 0.7) / 0.3); return capR * (1 - 0.18 * u); }   // low puck
      case 'column': { const u = sstep((t - 0.86) / 0.14); return capR * (1 - 0.3 * Math.pow(u, 1.3)); } // tall cylinder
      default:       { const u = sstep((t - 0.78) / 0.22); return capR * (1 - 0.42 * Math.pow(u, 1.4)); }
    }
  };
  // jewel cap is a faceted prism regardless of body; others echo body section
  const capPrism = capShape === 'jewel';
  const capCols = capPrism ? 10 : (prism ? f.facetN : Math.max(48, cols));
  const capGeo = buildLoft(capRFn, {
    y0: 0, y1: capH, H: capH * (capShape === 'sphere' ? 1 : 4),
    rows: capShape === 'dome' || capShape === 'sphere' ? 40 : capPrism ? 18 : 48, cols: capCols,
    sec: capPrism
      ? { p: 2, facetAmt: 1, facetN: 10, depth: 1, twistRad: 0, fluteAmp: 0, fluteCount: 16 }
      : { p: prism ? sec.p : 2, facetAmt: prism ? sec.facetAmt : 0, facetN: sec.facetN, depth: prism ? sec.depth : 1, twistRad: 0, fluteAmp: 0, fluteCount: 16 },
    closeBottom: true, closeTop: true, flat: prism || capPrism,
  });
  const capMesh = track(new THREE.Mesh(capGeo, capMat));
  capMesh.castShadow = true;
  capGroup.add(capMesh);
  capBaseY = f.H - 0.01;
  capGroup.position.y = capBaseY;
  bottle.add(capGroup);

  // --- acid-etched front label (brand + notes) ---
  if (brandName && brandName.trim()) {
    const notes = d.ranked.filter((r) => r.share > 0.04).slice(0, 3).map((r) => r.label).join(' · ');
    const lblSpec = Object.assign({}, d.label || {});
    if (labelInkOverride) { lblSpec.ink = labelInkOverride; lblSpec.foil = false; }
    const labelTex = makeLabelTexture(brandName.trim(), notes, lblSpec);
    const facetN = sec.facetN || 6;
    // a raised cartouche: follows the body SECTION (so it conforms to slab /
    // pebble / column shapes) and sits proud of the fine relief ribs.
    const liftFrac = (rel ? rel.amp * reliefScale * 1.15 : 0) + 0.02;
    const surfacePos = (theta, y) => {
      const yN = y / f.H;
      const nb = sstep((yN - 0.80) / 0.16);
      const p = lerp(sec.p, 2, nb), fa = sec.facetAmt * (1 - nb);
      const depth = lerp(sec.depth, 1, nb), wx = 1 / Math.sqrt(depth);
      const tw = (sec.twistRad || 0) * yN, th = theta + tw;
      const r = Math.max(rFn(y), 0.004);
      const rho = sectionRho(th, p, fa, facetN, 0, 16);
      const Rr = rho * r + liftFrac * r;
      return new THREE.Vector3(Math.cos(th) * Rr * wx, y, Math.sin(th) * Rr * depth * wx);
    };
    // vertical band centred on the belly; size it so the patch keeps the
    // label texture's 2:1 aspect (no glyph compression/stretch)
    const facetN2 = facetN;
    const LABEL_ASPECT = 1024 / 512; // texture W:H
    let cy = clamp(f.bellyY, 0.34, 0.52);
    const midR = Math.max(rFn(f.H * cy), 0.05);
    const wxMid = 1 / Math.sqrt(f.depthRatio || 1);
    const rEff = midR * wxMid * (0.55 + 0.45 * (f.depthRatio || 1)); // blend front x/z radius
    const arcMax = prism ? (TAU / facetN2) * 0.8 : Math.PI * 0.6;
    const bandMax = f.H * 0.4, bandMin = f.H * 0.16;
    let arc = arcMax;
    let bandH = (arc * rEff) / LABEL_ASPECT;
    if (bandH > bandMax) { bandH = bandMax; arc = (bandH * LABEL_ASPECT) / rEff; }
    if (bandH < bandMin) { bandH = bandMin; arc = Math.min((bandH * LABEL_ASPECT) / rEff, arcMax); }
    // user size adjustment (keeps aspect)
    arc *= labelScale; bandH *= labelScale;
    // user vertical position
    cy = clamp(cy + labelYOff, (0.1 + bandH / f.H / 2), (0.78 - bandH / f.H / 2));
    const yLo = f.H * cy - bandH / 2, yHi = f.H * cy + bandH / 2;
    const front = (prism
      ? Math.round((Math.PI * 0.25 - Math.PI / facetN2) / (TAU / facetN2)) * (TAU / facetN2) + Math.PI / facetN2
      : Math.PI * 0.25) + labelAngleOff;
    const cs = prism ? 10 : 40, rs = 18, verts = [], uvs = [], idx = [];
    for (let i = 0; i <= rs; i++) {
      const y = lerp(yLo, yHi, i / rs);
      for (let j = 0; j <= cs; j++) {
        const th = front - arc / 2 + arc * (j / cs);
        const v = surfacePos(th, y);
        verts.push(v.x, v.y, v.z);
        uvs.push(1 - j / cs, i / rs);
      }
    }
    for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
      const a = i * (cs + 1) + j, b = a + cs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    lgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    lgeo.setIndex(idx); lgeo.computeVertexNormals();
    const lmat = new THREE.MeshStandardMaterial({
      map: labelTex, transparent: true, alphaTest: 0.05,
      roughness: lblSpec.foil ? 0.3 : 0.55, metalness: lblSpec.foil ? 0.85 : 0.0, side: THREE.DoubleSide,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, envMapIntensity: lblSpec.foil ? 1.4 : 0.8,
    });
    const label = track(new THREE.Mesh(lgeo, lmat));
    label.frustumCulled = false; label.renderOrder = 4;
    bottle.add(label);
  }

  // --- region overlays (hover highlight)
  const mkOverlay = (t0, t1, rOff) => {
    const geo = buildLoft(rFn, {
      y0: f.H * t0, y1: f.H * t1, H: f.H, rows: Math.max(16, Math.round(rows * (t1 - t0))), cols, sec,
      rOff, neckBlend: true,
    });
    const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = track(new THREE.Mesh(geo, mat));
    mesh.renderOrder = 10;
    bottle.add(mesh);
    return mesh;
  };
  overlays = {
    silhouette: mkOverlay(0.002, 0.998, 0.012),
    section: mkOverlay(0.36, 0.52, 0.014),
    shoulder: mkOverlay(Math.max(f.shoulderY - 0.14, 0.3), Math.min(f.shoulderY + 0.14, 0.96), 0.012),
    base: mkOverlay(0.002, 0.2, 0.012),
    walls: mkOverlay(0.04, 0.96, -f.wall * 1.6),
    surface: mkOverlay(0.22, 0.78, 0.012),
  };

  // reframe camera (flat bottles widen in X by 1/√depth)
  bottle.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const totalH = f.H + capH + 0.1;
  const wxCam = 1 / Math.sqrt(f.depthRatio || 1);
  controls.target.set(0, totalH * 0.48, 0);
  const dist = Math.max(totalH * 2.2, f.W * wxCam * 3.6, 1.8);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  renderOnce(); // paint immediately — don't wait on the RAF loop (it throttles when backgrounded)
}

function renderOnce() {
  if (container.clientWidth && container.clientHeight) resize();
  controls.update();
  renderer.render(scene, camera);
}

// ----------------------------------------------------------------- loop
let turntable = false, ttSpeed = 0.35;
let highlightRegion = null;
const clock = new THREE.Clock();

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return false;
  const pr = quality.pr;
  const cv = renderer.domElement;
  if (cv.width === Math.round(w * pr) && cv.height === Math.round(h * pr)) return true; // already correct
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // repaint immediately — the RAF loop throttles to one frame when the iframe
  // is backgrounded, so a resize while unfocused would otherwise leave it blank
  renderer.render(scene, camera);
  return true;
}
new ResizeObserver(resize).observe(container);
window.addEventListener('resize', resize);
// bounded startup poll: the module loads async after the big three.js import,
// so the container may report 0 for a few frames. Retry until sized, then stop.
// (Never resize from inside the render loop — setSize mid-frame corrupts the
// transmission pass and drops everything but the backdrop.)
let _sizeTries = 0;
(function pollSize() {
  const ok = resize();
  if ((!ok || !container.clientWidth) && _sizeTries++ < 120) requestAnimationFrame(pollSize);
})();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (turntable) bottle.rotation.y += dt * ttSpeed * Math.PI * 2 * 0.12;
  capLift += (capLiftTarget - capLift) * Math.min(dt * 6, 1);
  if (capGroup) {
    capGroup.position.y = capBaseY + capLift * (0.42 + bodyTopY * 0.18);
    capGroup.rotation.y = capLift * 0.6;
  }
  for (const [k, mesh] of Object.entries(overlays)) {
    if (!mesh) continue;
    const target = k === highlightRegion ? 0.30 : 0;
    mesh.material.opacity += (target - mesh.material.opacity) * Math.min(dt * 10, 1);
  }
  // fill-rise
  if (liqRef && liqFill < 1) {
    liqFill = Math.min(1, liqFill + dt * 1.8);
    liqRef.scale.y = liqFill < 1 ? 1 - Math.pow(1 - liqFill, 3) : 1; // ease-out
  }
  // spray puff
  if (sprayGroup) {
    sprayT += dt;
    const pts = sprayGroup.geometry.attributes.position;
    const vel = sprayGroup.userData.vel;
    for (let i = 0; i < pts.count; i++) {
      pts.setX(i, pts.getX(i) + vel[i * 3] * dt);
      pts.setY(i, pts.getY(i) + vel[i * 3 + 1] * dt);
      pts.setZ(i, pts.getZ(i) + vel[i * 3 + 2] * dt);
      vel[i * 3 + 1] -= dt * 0.6; // gravity-ish settle
    }
    pts.needsUpdate = true;
    sprayGroup.material.opacity = Math.max(0, 0.85 * (1 - sprayT / 1.3));
    sprayGroup.material.size = 0.07 + sprayT * 0.06;
    if (sprayT > 1.3) { bottle.remove(sprayGroup); sprayGroup.geometry.dispose(); sprayGroup.material.dispose(); sprayGroup = null; }
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

function doSpray() {
  if (sprayGroup) { bottle.remove(sprayGroup); sprayGroup.geometry.dispose(); sprayGroup.material.dispose(); }
  const n = 260, pos = [], vel = [];
  // bias the whole puff toward the default 3/4 camera so it reads in-frame
  const dir = camera.position.clone().sub(controls.target); dir.y = 0; dir.normalize();
  for (let i = 0; i < n; i++) {
    // pre-spread into a small forward cone cloud so even the first frame reads as mist
    const sp = Math.random();
    const lat = (Math.random() - 0.5) * 0.9;
    const ox = dir.x * sp * 0.5 + dir.z * lat * 0.35;
    const oz = dir.z * sp * 0.5 - dir.x * lat * 0.35;
    const oy = 0.04 + sp * 0.32 + Math.random() * 0.06;
    pos.push(nozzlePos.x + ox, nozzlePos.y + oy, nozzlePos.z + oz);
    const spd = 0.5 + Math.random() * 1.3;
    vel.push(dir.x * spd + lat * 0.5, 0.35 + Math.random() * 0.45, dir.z * spd - lat * 0.5 * dir.x);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: MIST_TEX, color: 0xeaf2ff, size: 0.11, transparent: true, opacity: 0.8,
    depthWrite: false, sizeAttenuation: true, blending: THREE.NormalBlending,
  });
  sprayGroup = new THREE.Points(g, mat);
  sprayGroup.userData.vel = vel;
  sprayGroup.frustumCulled = false;
  sprayT = 0;
  bottle.add(sprayGroup);
  renderOnce();
}

// ----------------------------------------------------------------- API
window.SV = {
  update(design, animateFill) { buildBottle(design, animateFill); },
  setTurntable(on) { turntable = on; renderOnce(); },
  setTurntableSpeed(v) { ttSpeed = v; },
  setCap(open) { capLiftTarget = open ? 1 : 0; },
  highlight(region) { highlightRegion = region; },
  setQuality(k) {
    quality = QUALITY[k] || QUALITY.studio;
    key.shadow.mapSize.set(quality.shadow, quality.shadow);
    key.shadow.map?.dispose(); key.shadow.map = null;
    resize();
    if (currentDesign) buildBottle(currentDesign);
  },
  setReliefScale(v) {
    reliefScale = v;
    if (currentDesign) buildBottle(currentDesign);
  },
  setDecor(v) {
    decorScale = v;
    if (decoRef) { decoRef.visible = v > 0.02; decoRef.material.opacity = v; }
    else if (currentDesign) buildBottle(currentDesign);
    renderOnce();
  },
  setBrand(text) {
    brandName = text || '';
    if (currentDesign) buildBottle(currentDesign);
  },
  setLabelPos(o) {
    if (o.y != null) labelYOff = o.y;
    if (o.angle != null) labelAngleOff = o.angle;
    if (o.scale != null) labelScale = o.scale;
    if (currentDesign) buildBottle(currentDesign);
  },
  setLabelColor(hex) {
    labelInkOverride = hex || null;
    if (currentDesign) buildBottle(currentDesign);
  },
  setBackdrop(hex) {
    backdropTone = new THREE.Color(hex);
    applyBackdrop();
    renderOnce();
  },
  snapshot(w = 900, h = 1100) {
    const oldW = container.clientWidth, oldH = container.clientHeight;
    renderer.setPixelRatio(1.5);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(quality.pr);
    renderer.setSize(oldW, oldH);
    camera.aspect = oldW / oldH;
    camera.updateProjectionMatrix();
    return url;
  },
  resetView() { bottle.rotation.y = 0; renderOnce(); },
  setCamera(preset) {
    if (!currentDesign) return;
    const f = currentDesign.form;
    const totalH = bodyTopY + 0.45;
    const cy = totalH * 0.48;
    const wxCam = 1 / Math.sqrt(f.depthRatio || 1);
    const dist = Math.max(totalH * 2.2, f.W * wxCam * 3.6, 1.8);
    if (preset === 'packshot') { controls.target.set(0, cy, 0); camera.position.set(0, cy, dist); }
    else if (preset === 'macro') { controls.target.set(0, f.H * 0.42, 0); camera.position.set(dist * 0.26, f.H * 0.46, dist * 0.46); }
    else if (preset === 'top') { controls.target.set(0, cy, 0); camera.position.set(0.001, cy + dist * 0.95, 0.001); }
    else { controls.target.set(0, cy, 0); camera.position.set(dist * 0.5, cy + totalH * 0.2, dist * 0.85); } // hero 3/4
    camera.updateProjectionMatrix(); controls.update(); renderOnce();
  },
  setSurface(name) { surfaceName = name || 'sweep'; applyBackdrop(); renderOnce(); },
  exportPNG(scale) {
    const w = Math.round(1000 * (scale || 2)), h = Math.round(1250 * (scale || 2));
    return this.snapshot(w, h);
  },
  spray() { doSpray(); },
  recordTurntable(onDone) {
    if (!renderer.domElement.captureStream || typeof MediaRecorder === 'undefined') {
      onDone && onDone(null, 'unsupported'); return;
    }
    const wasTurn = turntable;
    const startRot = bottle.rotation.y;
    bottle.rotation.y = 0;
    turntable = false;
    const stream = renderer.domElement.captureStream(60);
    let type = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(type)) type = 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12000000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      turntable = wasTurn; bottle.rotation.y = startRot;
      onDone && onDone(new Blob(chunks, { type: 'video/webm' }), null);
    };
    rec.start();
    const dur = 4000, t0 = performance.now();
    (function spin() {
      const p = (performance.now() - t0) / dur;
      bottle.rotation.y = p * Math.PI * 2;
      renderer.render(scene, camera);
      if (p < 1) requestAnimationFrame(spin);
      else rec.stop();
    })();
  },
};
window.dispatchEvent(new Event('sv-ready'));
