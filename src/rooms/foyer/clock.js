// Borrowed from An Ordinary Cat (room1/props.js): the grandfather clock and cobwebs, unchanged apart from this header.

// Every builder returns a Group with origin at its base centre (unless noted), front facing +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from '../../engine/props/materials.js';
import * as F from '../../engine/props/furniture.js';
import { makeCanvas, canvasTexture, rng, noiseTexture } from '../../engine/props/textures.js';

const TAU = Math.PI * 2;
const SERIF = '"Cormorant Garamond", Georgia, serif';

const noRay = (o) => { o.raycast = () => {}; o.userData.noRaycast = true; return o; };
const mesh = (geo, mat, { cast = true, receive = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m; };

// cached small materials ----------------------------------------------------------------------
const matCache = new Map();
function cached(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
export const blued = () => cached('blued', () => new THREE.MeshStandardMaterial({ color: '#141a26', metalness: 0.7, roughness: 0.32 }));

// GRANDFATHER CLOCK
// ---------------------------------------------------------------------------------------------
function clockFaceTexture() {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
  const R = S / 2;
  const gr = g.createRadialGradient(R, R * 0.9, 10, R, R, R);
  gr.addColorStop(0, '#f3e9cf'); gr.addColorStop(0.8, '#e6d6b0'); gr.addColorStop(1, '#bfa776');
  g.fillStyle = gr; g.beginPath(); g.arc(R, R, R, 0, TAU); g.fill();
  // aged speckle
  const r = rng(5);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,60,20,${r() * 0.06})`; g.fillRect(r() * S, r() * S, 2 + r() * 3, 2 + r() * 3); }
  g.strokeStyle = '#3a2614'; g.lineWidth = 3;
  g.beginPath(); g.arc(R, R, R * 0.95, 0, TAU); g.stroke();
  g.beginPath(); g.arc(R, R, R * 0.86, 0, TAU); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(R, R, R * 0.62, 0, TAU); g.stroke();
  // minute ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const r0 = R * 0.86, r1 = i % 5 ? R * 0.9 : R * 0.95;
    g.lineWidth = i % 5 ? 2 : 4;
    g.beginPath(); g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); g.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1); g.stroke();
  }
  const nums = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#1e140c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(S * 0.085)}px ${SERIF}`;
  nums.forEach((n, i) => {
    const a = (i / 12) * TAU - Math.PI / 2;
    g.save(); g.translate(R + Math.cos(a) * R * 0.74, R + Math.sin(a) * R * 0.74); g.rotate(a + Math.PI / 2);
    g.fillText(n, 0, 0); g.restore();
  });
  g.font = `italic 600 ${Math.round(S * 0.042)}px ${SERIF}`;
  g.fillStyle = '#4a321c';
  g.fillText('Quince · Tower', R, R * 1.32);
  g.fillText('MDCCLXII', R, R * 1.42);
  return canvasTexture(c);
}

function moonDialTexture() {
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#0f1a3c'); gr.addColorStop(1, '#22346a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const r = rng(12);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,240,200,${0.4 + r() * 0.6})`; const x = r() * W, y = r() * H * 0.9; g.beginPath(); g.arc(x, y, 1 + r() * 2, 0, TAU); g.fill(); }
  // moon with a face
  g.fillStyle = '#f0dc9a'; g.beginPath(); g.arc(W * 0.5, H * 0.55, H * 0.3, 0, TAU); g.fill();
  g.fillStyle = '#c9a85a'; g.beginPath(); g.arc(W * 0.46, H * 0.5, 6, 0, TAU); g.arc(W * 0.55, H * 0.5, 6, 0, TAU); g.fill();
  g.strokeStyle = '#a8843a'; g.lineWidth = 3; g.beginPath(); g.arc(W * 0.5, H * 0.6, 18, 0.3, Math.PI - 0.3); g.stroke();
  return canvasTexture(c);
}

function handShape(len, width, tail, spade = true) {
  const s = new THREE.Shape();
  s.moveTo(-width * 0.35, -tail);
  s.lineTo(width * 0.35, -tail);
  s.lineTo(width * 0.22, len * 0.55);
  if (spade) {
    s.quadraticCurveTo(width * 1.4, len * 0.68, width * 0.25, len * 0.8);
    s.lineTo(0, len);
    s.lineTo(-width * 0.25, len * 0.8);
    s.quadraticCurveTo(-width * 1.4, len * 0.68, -width * 0.22, len * 0.55);
  } else {
    s.lineTo(width * 0.08, len);
    s.lineTo(-width * 0.08, len);
    s.lineTo(-width * 0.22, len * 0.55);
  }
  s.closePath();
  // counterweight ring on the tail
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: false });
  const ring = new THREE.CylinderGeometry(width * 0.5, width * 0.5, 0.002, 16); ring.rotateX(Math.PI / 2); ring.translate(0, -tail * 0.7, 0.001);
  const ni = (x) => (x.index ? x.toNonIndexed() : x);
  return mergeGeometries([ni(geo), ni(ring)]);
}

/**
 * Longcase clock. Front +Z. userData: { faceCenter (local V3), faceRadius, hourHand, minuteHand (Groups, rotate .z negative = clockwise),
 *   pendulum (Group, swing .rotation.z), panel (Group hinged at its left edge — rotate .y negative to open), keySpot (Group inside the base) }
 */
export function grandfatherClock() {
  const g = new THREE.Group(); g.name = 'grandfatherClock';
  const wood = M.mahogany({ tint: '#5a2416' });
  const dark = M.walnut({ tint: '#2a140c' });
  const brass = M.brass();
  const W = 0.56, D = 0.36;
  // plinth + base
  const plinth = F.rbox(W + 0.06, 0.08, D + 0.05, dark, 0.012); plinth.position.y = 0.04; g.add(plinth);
  // base: a recessed core plus a front frame around the panel opening (so the cavity is really open)
  const pw = 0.3, ph = 0.28, py = 0.34;
  const fz0 = 0.03, fd = D / 2 - fz0; // frame depth
  const core = F.rbox(W, 0.5, D / 2 + fz0, wood, 0.015); core.position.set(0, 0.33, (-D / 2 + fz0) / 2); g.add(core);
  const ox = (pw - 0.02) / 2, oy = (ph - 0.02) / 2;
  const fr = (x0, x1, y0, y1) => { const m = F.rbox(x1 - x0, y1 - y0, fd, wood, 0.006); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, fz0 + fd / 2); g.add(m); };
  fr(-W / 2, -ox, 0.08, 0.58); fr(ox, W / 2, 0.08, 0.58); fr(-ox, ox, 0.08, py - oy); fr(-ox, ox, py + oy, 0.58);
  const baseCap = F.rbox(W + 0.04, 0.04, D + 0.04, dark, 0.012); baseCap.position.y = 0.6; g.add(baseCap);
  // base panel (door) + cavity
  const cav = mesh(new THREE.BoxGeometry(pw - 0.03, ph - 0.03, 0.15), new THREE.MeshStandardMaterial({ color: '#160b06', roughness: 1, side: THREE.BackSide }), { cast: false });
  cav.position.set(0, py, D / 2 - 0.068);
  g.add(cav);
  const panel = new THREE.Group(); panel.name = 'clockPanel';
  panel.position.set(-pw / 2, py, D / 2 + 0.004);
  const pf = F.rbox(pw, ph, 0.02, wood, 0.006); pf.position.x = pw / 2; panel.add(pf);
  const pin = F.rbox(pw - 0.06, ph - 0.06, 0.008, dark, 0.004); pin.position.set(pw / 2, 0, 0.012); panel.add(pin);
  const knobM = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), brass); knobM.position.set(pw - 0.03, 0, 0.02); panel.add(knobM);
  const rose = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 24), brass); rose.position.set(pw / 2, 0, 0.018); panel.add(rose);
  g.add(panel);
  const keySpot = new THREE.Group(); keySpot.position.set(0, py - ph / 2 + 0.02, D / 2 - 0.06); g.add(keySpot);
  const cavLight = new THREE.PointLight('#ffc070', 0, 0.7, 2); cavLight.position.set(0, py + 0.08, D / 2 - 0.02); g.add(cavLight);
  // waist
  const waistW = 0.44, waistH = 0.92, waistY0 = 0.62;
  const waist = F.rbox(waistW, waistH, D - 0.06, wood, 0.012); waist.position.set(0, waistY0 + waistH / 2, -0.03); g.add(waist);
  // trunk window (glass) with dark interior + pendulum
  const winW = 0.24, winH = 0.62, winY = waistY0 + 0.15 + winH / 2;
  const interior = mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshStandardMaterial({ color: '#1a0d07', roughness: 1 }), { cast: false });
  interior.position.set(0, winY, D / 2 - 0.08);
  g.add(interior);
  const frame = [];
  for (const [x, y, w, h] of [[0, winY + winH / 2 + 0.015, winW + 0.06, 0.03], [0, winY - winH / 2 - 0.015, winW + 0.06, 0.03], [-winW / 2 - 0.015, winY, 0.03, winH], [winW / 2 + 0.015, winY, 0.03, winH]]) {
    const b = F.rbox(w, h, 0.03, dark, 0.006); b.position.set(x, y, D / 2 - 0.045); g.add(b); frame.push(b);
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), M.glass({ opacity: 0.12 }));
  glass.position.set(0, winY, D / 2 - 0.04); glass.renderOrder = 3;
  g.add(glass);
  const pendulum = new THREE.Group(); pendulum.name = 'pendulum';
  pendulum.position.set(0, waistY0 + waistH + 0.05, D / 2 - 0.1);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.66, 8), brass); rod.position.y = -0.33; pendulum.add(rod);
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.014, 32), M.brass({ polished: true })); bob.rotation.x = Math.PI / 2; bob.position.y = -0.66; pendulum.add(bob);
  const bobRim = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.006, 8, 32), brass); bobRim.position.y = -0.66; pendulum.add(bobRim);
  g.add(pendulum);
  // weights on chains
  for (const x of [-0.07, 0.07]) {
    const wt = F.lathe([[0, 0], [0.022, 0], [0.024, 0.01], [0.024, 0.16], [0.02, 0.17], [0, 0.17]], brass, 16);
    wt.position.set(x, winY + 0.02 + (x > 0 ? -0.06 : 0), D / 2 - 0.12); g.add(wt);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.3, 4), brass); ch.position.set(x, winY + 0.33 + (x > 0 ? -0.06 : 0), D / 2 - 0.12); g.add(ch);
  }
  // hood
  const hoodY0 = waistY0 + waistH, hoodH = 0.6;
  const hoodCap = F.rbox(W + 0.04, 0.04, D + 0.04, dark, 0.012); hoodCap.position.y = hoodY0 + 0.02; g.add(hoodCap);
  const hood = F.rbox(W, hoodH, D, wood, 0.015); hood.position.y = hoodY0 + 0.04 + hoodH / 2; g.add(hood);
  for (const s of [-1, 1]) {
    const col = F.lathe([[0, 0], [0.022, 0], [0.018, 0.03], [0.016, hoodH - 0.06], [0.022, hoodH - 0.03], [0.022, hoodH - 0.02], [0, hoodH - 0.02]], brass, 14);
    col.position.set(s * (W / 2 - 0.02), hoodY0 + 0.05, D / 2 + 0.01); g.add(col);
  }
  // face plate (brass square dial plate) + painted face
  const faceR = 0.165;
  const faceCenter = new THREE.Vector3(0, hoodY0 + 0.04 + 0.25, D / 2 + 0.004);
  const plate = F.rbox(faceR * 2 + 0.06, faceR * 2 + 0.06, 0.006, brass, 0.003); plate.position.copy(faceCenter); plate.position.z -= 0.003; g.add(plate);
  const face = mesh(new THREE.CircleGeometry(faceR, 48), new THREE.MeshStandardMaterial({ map: clockFaceTexture(), roughness: 0.55 }), { cast: false });
  face.position.copy(faceCenter); face.position.z += 0.002; g.add(face);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(faceR + 0.006, 0.008, 10, 48), M.brass({ polished: true })); bezel.position.copy(faceCenter); bezel.position.z += 0.004; g.add(bezel);
  // arch with moon dial
  const archR = faceR + 0.03;
  const archY = faceCenter.y + faceR + 0.03;
  const archShape = new THREE.Shape(); archShape.absarc(0, 0, archR, 0, Math.PI, false); archShape.lineTo(archR, 0);
  const archGeo = new THREE.ShapeGeometry(archShape, 24);
  const ap = archGeo.attributes.position, au = archGeo.attributes.uv;
  for (let i = 0; i < ap.count; i++) au.setXY(i, (ap.getX(i) + archR) / (archR * 2), ap.getY(i) / archR);
  const archM = mesh(archGeo, new THREE.MeshStandardMaterial({ map: moonDialTexture(), roughness: 0.5 }), { cast: false });
  archM.position.set(0, archY, D / 2 + 0.003); g.add(archM);
  const archHood = F.rbox(W, 0.26, D, wood, 0.015); archHood.position.set(0, archY + 0.09, -0.006); g.add(archHood);
  // pediment + finials
  const ped = F.rbox(W + 0.08, 0.05, D + 0.06, dark, 0.012); ped.position.y = archY + 0.24; g.add(ped);
  const pedShape = new THREE.Shape(); pedShape.moveTo(-W / 2 - 0.02, 0); pedShape.lineTo(W / 2 + 0.02, 0); pedShape.lineTo(0.05, 0.12); pedShape.lineTo(-0.05, 0.12); pedShape.closePath();
  const pedM = mesh(new THREE.ExtrudeGeometry(pedShape, { depth: D * 0.9, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }), wood);
  pedM.position.set(0, archY + 0.265, -D * 0.45); g.add(pedM);
  for (const [x, y] of [[-W / 2, archY + 0.27], [W / 2, archY + 0.27], [0, archY + 0.4]]) {
    const fin = F.lathe([[0, 0], [0.02, 0], [0.012, 0.02], [0.022, 0.05], [0.01, 0.08], [0.003, 0.1], [0, 0.1]], M.brass({ polished: true }), 14);
    fin.position.set(x, y, D * 0.1); g.add(fin);
  }
  // hands
  const handMat = blued();
  const hourHand = new THREE.Group(); hourHand.position.copy(faceCenter); hourHand.position.z += 0.008;
  const hh = new THREE.Mesh(handShape(faceR * 0.55, 0.026, 0.03), handMat); hourHand.add(hh);
  const minuteHand = new THREE.Group(); minuteHand.position.copy(faceCenter); minuteHand.position.z += 0.013;
  const mh = new THREE.Mesh(handShape(faceR * 0.86, 0.02, 0.04, false), handMat); minuteHand.add(mh);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 16), M.brass({ polished: true }));
  cap.rotation.x = Math.PI / 2; cap.position.copy(faceCenter); cap.position.z += 0.017; g.add(cap);
  g.add(hourHand, minuteHand);
  F.shadowAll(g);
  [face, archM, interior, glass].forEach((m) => { m.castShadow = false; });
  g.userData = { ...g.userData, faceCenter, faceRadius: faceR, hourHand, minuteHand, pendulum, panel, keySpot, face, cavLight };
  return g;
}

// ---------------------------------------------------------------------------------------------
// GLOBE
// ---------------------------------------------------------------------------------------------

/** Corner cobweb: a translucent radial web texture on a triangle-ish plane. */
let _webTex = null;
export function cobweb({ size = 0.6 } = {}) {
  if (!_webTex) {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), r = rng(19);
    g.strokeStyle = 'rgba(230,230,230,0.55)'; g.lineWidth = 1.4;
    const spokes = 9;
    for (let i = 0; i < spokes; i++) { const a = (i / (spokes - 1)) * (Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * S, Math.sin(a) * S); g.stroke(); }
    for (let k = 1; k < 12; k++) {
      const rad = (k / 12) * S * (0.9 + r() * 0.1);
      g.beginPath();
      for (let i = 0; i < spokes; i++) { const a = (i / (spokes - 1)) * (Math.PI / 2); const rr = rad * (0.92 + r() * 0.1); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? g.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    _webTex = canvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: _webTex, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, color: '#b8b0a0' }));
  noRay(m);
  return m;
}

/** A rolled scroll with a ribbon. Lies along X. */
export function scroll({ len = 0.28, r = 0.022 } = {}) {
  const g = new THREE.Group(); g.name = 'scroll';
  const p = mesh(new THREE.CylinderGeometry(r, r, len, 16), M.parchment()); p.rotation.z = Math.PI / 2; p.position.y = r; g.add(p);
  const rib = mesh(new THREE.TorusGeometry(r + 0.002, 0.003, 6, 20), M.matte('#7a1c22')); rib.rotation.y = Math.PI / 2; rib.position.y = r; g.add(rib);
  return g;
}

/** A merged stack of books lying flat. */
export function bookStack({ count = 4, seed = 1, colors = ['#5a1a14', '#1f3a2a', '#3a2a14', '#22304a', '#4a3a1a', '#2a1a2a'] } = {}) {
  const r = rng(seed); const geos = []; let y = 0;
  for (let i = 0; i < count; i++) {
    const t = 0.03 + r() * 0.03, w = 0.17 + r() * 0.07, d = 0.23 + r() * 0.06;
    const geo = F.bookGeometry(t, w, d, colors[Math.floor(r() * colors.length)]); // standing book t thick, w tall
    // lying flat: rotate so spine faces +X-ish, page edges up
    geo.rotateZ(Math.PI / 2); geo.translate(t / 2, 0, 0); geo.rotateY((r() - 0.5) * 0.4 + (i % 2 ? 0.1 : -0.1));
    geo.translate(0, y, 0);
    // after rotateZ(90°) the book's height axis lies along -X; recentre
    geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2, y - bb.min.y, -(bb.min.z + bb.max.z) / 2);
    y += t;
    geos.push(geo);
  }
  const m = mesh(mergeGeometries(geos), F.bookMaterial());
  m.name = 'bookStack';
  return m;
}

// ---------------------------------------------------------------------------------------------
// GRIMOIRE on a stand, with chain and a 4-letter word lock
// ---------------------------------------------------------------------------------------------
