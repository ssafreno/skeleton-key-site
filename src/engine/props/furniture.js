// Furniture & fixture builders. Every builder returns a THREE.Group whose origin is at the object's
// base centre on the floor (unless noted), front facing +Z, sizes in metres. Meshes cast/receive shadows.
// Useful sub-parts are exposed on group.userData (documented per builder). Animated builders set
// group.userData.update(dt, t) — Room auto-registers these at the end of build().
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './materials.js';
import { bookSpineTexture, labelTexture, rugTexture, makeCanvas, canvasTexture, rng } from './textures.js';
import { flickerLight, lightShaft } from './lights.js';

// ---------------------------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------------------------
const geoCache = new Map();
function cachedGeo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }

/** Rounded (bevelled) box geometry, cached. */
export function roundedBoxGeometry(w, h, d, r = 0.01, seg = 2) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return cachedGeo(`rb:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${r.toFixed(4)}:${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.max(r, 0.0005)));
}
/** Bevelled box mesh with shadows. */
export function rbox(w, h, d, mat, r = 0.01) {
  const m = new THREE.Mesh(roundedBoxGeometry(w, h, d, r), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** Lathe mesh from [[radius, y], ...] profile (bottom → top). */
export function lathe(points, mat, segments = 24) {
  const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y)), segments);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function shadowAll(obj) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }
/** Swap U/V on a geometry (turn horizontal wood grain vertical). Returns a new geometry. */
export function rotateUV(geo) {
  const g = geo.clone();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setXY(i, uv.getY(i), u); }
  uv.needsUpdate = true;
  return g;
}

function turnedLegProfile(h, r = 0.028) {
  return [
    [0, 0], [r * 0.75, 0], [r * 0.8, h * 0.04], [r * 0.6, h * 0.1], [r * 0.7, h * 0.35], [r * 1.05, h * 0.45], [r * 0.7, h * 0.52],
    [r * 0.85, h * 0.6], [r * 0.85, h * 0.8], [r * 1.0, h * 0.84], [r * 1.0, h], [0, h],
  ];
}

// ---------------------------------------------------------------------------------------------
// tables & desks
// ---------------------------------------------------------------------------------------------
/**
 * Table. opts: w, d, h, material, legs: 'turned'|'square', topThickness.
 * userData: { top (Mesh), topY }
 */
export function table({ w = 1.4, d = 0.8, h = 0.76, material = M.oak(), legs = 'turned', topThickness = 0.05 } = {}) {
  const g = new THREE.Group(); g.name = 'table';
  const top = rbox(w, topThickness, d, material, 0.012);
  top.position.y = h - topThickness / 2;
  g.add(top);
  const apronH = 0.1, inset = 0.07;
  const ax = rbox(w - inset * 2, apronH, 0.025, material, 0.004);
  const az = rbox(0.025, apronH, d - inset * 2, material, 0.004);
  for (const s of [-1, 1]) {
    const a = ax.clone(); a.position.set(0, h - topThickness - apronH / 2, s * (d / 2 - inset)); g.add(a);
    const b = az.clone(); b.position.set(s * (w / 2 - inset), h - topThickness - apronH / 2, 0); g.add(b);
  }
  const legH = h - topThickness;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = legs === 'turned' ? lathe(turnedLegProfile(legH), material, 16) : rbox(0.05, legH, 0.05, material, 0.006);
    leg.position.set(sx * (w / 2 - inset), legs === 'turned' ? 0 : legH / 2, sz * (d / 2 - inset));
    g.add(leg);
  }
  g.userData.top = top;
  g.userData.topY = h;
  return g;
}

function knob(mat = M.brass()) {
  const k = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 16), mat);
  plate.rotation.x = Math.PI / 2;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), mat);
  ball.position.z = 0.016;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.014, 8), mat);
  stem.rotation.x = Math.PI / 2; stem.position.z = 0.008;
  k.add(plate, stem, ball);
  return shadowAll(k);
}

function drawerFront(w, h, material, { keyhole = false } = {}) {
  const g = new THREE.Group();
  const f = rbox(w, h, 0.022, material, 0.006);
  g.add(f);
  const inset = rbox(w - 0.04, h - 0.04, 0.006, material, 0.002);
  inset.position.z = 0.012;
  g.add(inset);
  const k = knob(); k.position.z = 0.014; g.add(k);
  if (keyhole) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 16), M.brass());
    plate.rotation.x = Math.PI / 2; plate.position.set(0, h * 0.28, 0.0125);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.012), M.matte('#0a0604'));
    hole.position.set(0, h * 0.28, 0.0145);
    g.add(plate, hole);
    k.position.y = -h * 0.12;
  }
  return g;
}

/**
 * Writing desk with two pedestals of drawers and a centre drawer (with keyhole).
 * opts: w, d, h, material, centreDrawer (bool)
 * userData: { top, topY, drawer (Group: centre drawer; slide it along +z to open, e.g. tween drawer.position.z → 0.3),
 *             drawerInterior (Group inside the drawer — put items here), drawers: [side drawer groups] }
 */
export function desk({ w = 1.5, d = 0.72, h = 0.78, material = M.walnut(), centreDrawer = true } = {}) {
  const g = new THREE.Group(); g.name = 'desk';
  const topT = 0.045;
  const top = rbox(w + 0.04, topT, d + 0.03, material, 0.012);
  top.position.y = h - topT / 2;
  g.add(top);
  // leather inlay
  const inlay = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.72, d * 0.62), M.velvet({ color: '#1f3a2a' }));
  inlay.rotation.x = -Math.PI / 2; inlay.position.y = h + 0.0006; inlay.receiveShadow = true;
  g.add(inlay);
  const pedW = w * 0.3, bodyH = h - topT;
  const drawers = [];
  for (const s of [-1, 1]) {
    const ped = rbox(pedW, bodyH - 0.06, d - 0.02, material, 0.01);
    ped.position.set(s * (w / 2 - pedW / 2), (bodyH - 0.06) / 2 + 0.06, 0);
    g.add(ped);
    // plinth feet
    const plinth = rbox(pedW + 0.02, 0.06, d, M.walnut({ tint: M.palette.walnutDark }), 0.008);
    plinth.position.set(s * (w / 2 - pedW / 2), 0.03, 0);
    g.add(plinth);
    const n = 3, dh = (bodyH - 0.1) / n;
    for (let i = 0; i < n; i++) {
      const df = drawerFront(pedW - 0.04, dh - 0.02, material);
      df.position.set(s * (w / 2 - pedW / 2), 0.08 + dh * (i + 0.5), d / 2 - 0.004);
      g.add(df); drawers.push(df);
    }
  }
  // back modesty panel
  const back = rbox(w - pedW * 2 + 0.01, bodyH * 0.6, 0.02, material, 0.004);
  back.position.set(0, h - topT - bodyH * 0.3, -d / 2 + 0.03);
  g.add(back);
  let drawer = null, drawerInterior = null;
  if (centreDrawer) {
    const cw = w - pedW * 2 - 0.04, ch = 0.11, cd = d - 0.08;
    drawer = new THREE.Group(); drawer.name = 'centreDrawer';
    const front = drawerFront(cw, ch, material, { keyhole: true });
    front.position.z = 0;
    drawer.add(front);
    const box = new THREE.Group();
    const bottom = rbox(cw - 0.02, 0.01, cd, M.oak(), 0.002); bottom.position.set(0, -ch / 2 + 0.01, -cd / 2);
    const sideL = rbox(0.012, ch - 0.02, cd, M.oak(), 0.002); sideL.position.set(-cw / 2 + 0.016, -0.005, -cd / 2);
    const sideR = sideL.clone(); sideR.position.x = cw / 2 - 0.016;
    const backP = rbox(cw - 0.02, ch - 0.02, 0.012, M.oak(), 0.002); backP.position.set(0, -0.005, -cd + 0.006);
    box.add(bottom, sideL, sideR, backP);
    drawer.add(box);
    drawerInterior = new THREE.Group(); drawerInterior.name = 'drawerInterior';
    drawerInterior.position.set(0, -ch / 2 + 0.016, -cd / 2);
    drawer.add(drawerInterior);
    drawer.position.set(0, h - topT - ch / 2 - 0.008, d / 2 - 0.004);
    g.add(drawer);
    // dark cavity behind the drawer
    const cav = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.01), M.matte('#0c0705'));
    cav.position.set(0, drawer.position.y, -d / 2 + 0.06);
    g.add(cav);
  }
  g.userData = { ...g.userData, top, topY: h, drawer, drawerInterior, drawers };
  return g;
}

// ---------------------------------------------------------------------------------------------
// books & shelves
// ---------------------------------------------------------------------------------------------
export const BOOK_COLORS = ['#7a1f1f', '#1f4a2e', '#1f2f5a', '#5a3a1a', '#8a6a1f', '#4a1f4a', '#1a1a1a', '#1f5a5a', '#9a7a4a', '#6a2a1a', '#2a3a2a', '#3a2a4a'];
const PAGE = new THREE.Color('#e8dcc0');
let _bookMat = null;
/** Shared material for books built with bookGeometry (vertex colours + spine detail texture). */
export function bookMaterial() {
  if (!_bookMat) _bookMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: bookSpineTexture(), roughness: 0.75 });
  return _bookMat;
}
/**
 * Book geometry with per-face colours: spine (+Z) and covers coloured, page edges cream.
 * Origin at the bottom centre. Returns BufferGeometry with a colour attribute.
 */
export function bookGeometry(w = 0.04, h = 0.24, d = 0.17, color = '#7a1f1f') {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const col = new THREE.Color(color), n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const uv = geo.attributes.uv;
  // face order: px, nx, py, ny, pz, nz — 4 verts each
  for (let f = 0; f < 6; f++) {
    const c = f === 2 || f === 3 || f === 5 ? PAGE : col;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      if (f !== 4) uv.setXY(i, 0.5, 0.97); // plain white texel
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
/** Single book mesh (e.g. a pushable puzzle book). Front/spine faces +Z, origin bottom centre. */
export function book({ w = 0.045, h = 0.25, d = 0.17, color = '#7a1f1f' } = {}) {
  const m = new THREE.Mesh(bookGeometry(w, h, d, color), bookMaterial());
  m.castShadow = true; m.receiveShadow = true;
  m.name = 'book';
  return m;
}

/**
 * Bookshelf filled with varied books (merged into one mesh per shelf — 1 draw call each).
 * opts: w, h, d, shelves (count of compartments), material, fill (0..1), seed, colors,
 *       reserve: [{ shelf: index (0 = bottom), from: 0..1, to: 0..1 }] — leave gaps for your own puzzle books.
 * userData: { shelfYs: [y of each compartment floor], innerWidth, innerDepth, shelfHeight, books: [Mesh per shelf] }
 */
export function bookshelf({ w = 1.6, h = 2.2, d = 0.38, shelves = 5, material = M.walnut(), fill = 0.9, seed = 1, colors = BOOK_COLORS, reserve = [] } = {}) {
  const g = new THREE.Group(); g.name = 'bookshelf';
  const r = rng(seed);
  const side = 0.04, plinthH = 0.1, corniceH = 0.08;
  for (const s of [-1, 1]) {
    const p = rbox(side, h, d, material, 0.008);
    p.position.set(s * (w / 2 - side / 2), h / 2, 0);
    g.add(p);
  }
  const plinth = rbox(w + 0.03, plinthH, d + 0.02, material, 0.01); plinth.position.y = plinthH / 2; g.add(plinth);
  const cornice = rbox(w + 0.08, corniceH, d + 0.05, material, 0.015); cornice.position.y = h - corniceH / 2; g.add(cornice);
  const crown = rbox(w + 0.12, 0.025, d + 0.07, material, 0.008); crown.position.y = h + 0.0125; g.add(crown);
  const backMat = M.wood({ tint: '#33200f', seed: 9, roughness: 0.8 });
  const back = new THREE.Mesh(rotateUV(new THREE.BoxGeometry(w - side * 2, h - plinthH - corniceH, 0.015)), backMat);
  back.position.set(0, plinthH + (h - plinthH - corniceH) / 2, -d / 2 + 0.008); back.receiveShadow = true;
  g.add(back);
  const innerW = w - side * 2, innerD = d - 0.03;
  const usable = h - plinthH - corniceH;
  const sh = usable / shelves;
  const shelfYs = [];
  const bookMeshes = [];
  for (let i = 0; i < shelves; i++) {
    const y = plinthH + i * sh;
    shelfYs.push(y + 0.02);
    if (i > 0) {
      const plank = rbox(innerW, 0.025, innerD, material, 0.005);
      plank.position.set(0, y + 0.0125, 0.01);
      g.add(plank);
    }
    // books
    const geos = [];
    const maxH = sh - 0.05;
    let x = -innerW / 2 + 0.01;
    const end = innerW / 2 - 0.01;
    const res = reserve.filter((q) => q.shelf === i).map((q) => [-innerW / 2 + q.from * innerW, -innerW / 2 + q.to * innerW]);
    while (x < end - 0.02) {
      const inRes = res.find(([a, b]) => x >= a - 0.005 && x < b);
      if (inRes) { x = inRes[1] + 0.004; continue; }
      if (r() > fill && r() < 0.5) { x += 0.03 + r() * 0.08; continue; } // gap
      const bw = 0.022 + r() * 0.04;
      if (x + bw > end) break;
      if (res.some(([a]) => x < a && x + bw > a)) { x = res.find(([a]) => x < a && x + bw > a)[1] + 0.004; continue; }
      const bh = Math.min(maxH, maxH * (0.62 + r() * 0.36));
      const bd = innerD * (0.7 + r() * 0.2);
      const color = new THREE.Color(colors[Math.floor(r() * colors.length)]).offsetHSL(0, (r() - 0.5) * 0.1, (r() - 0.5) * 0.08);
      const bg = bookGeometry(bw, bh, bd, '#' + color.getHexString());
      // occasional lean at gaps
      const lean = r() < 0.06 ? (r() - 0.5) * 0.25 : 0;
      if (lean) { bg.rotateZ(lean); }
      bg.translate(x + bw / 2 + (lean ? Math.sign(-lean) * 0.01 : 0), y + 0.025, -innerD / 2 + bd / 2 + 0.02 + (innerD - bd) * 0.5);
      geos.push(bg);
      x += bw + 0.0015 + (r() < 0.1 ? r() * 0.01 : 0);
    }
    // a lying-flat stack now and then
    if (r() < 0.35 && !res.length) {
      let sy = y + 0.025;
      const sx = innerW / 2 - 0.16;
      for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
        const bt = 0.03 + r() * 0.02;
        const bg = bookGeometry(0.17, bt, 0.22 + r() * 0.03, colors[Math.floor(r() * colors.length)]);
        bg.translate(sx + (r() - 0.5) * 0.02, sy, -innerD / 2 + 0.14);
        sy += bt;
        geos.push(bg);
      }
    }
    if (geos.length) {
      const merged = mergeGeometries(geos);
      geos.forEach((q) => q.dispose());
      const bm = new THREE.Mesh(merged, bookMaterial());
      bm.castShadow = true; bm.receiveShadow = true; bm.name = `books_${i}`;
      g.add(bm);
      bookMeshes.push(bm);
    }
  }
  g.userData = { ...g.userData, shelfYs, innerWidth: innerW, innerDepth: innerD, shelfHeight: sh, books: bookMeshes, depth: d, width: w, height: h };
  return g;
}

/**
 * Wall-mounted shelf plank with two brass/iron brackets. Origin at the back-centre of the plank top surface.
 * userData: { topY: 0 }
 */
export function wallShelf({ w = 1.2, d = 0.24, t = 0.035, material = M.oak(), bracket = M.iron() } = {}) {
  const g = new THREE.Group(); g.name = 'wallShelf';
  const p = rbox(w, t, d, material, 0.006); p.position.set(0, -t / 2, d / 2); g.add(p);
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(d * 0.85, 0); shape.quadraticCurveTo(d * 0.3, -0.04, 0, -d * 0.8); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1 });
    const b = new THREE.Mesh(geo, bracket);
    b.rotation.y = -Math.PI / 2;
    b.position.set(s * (w / 2 - 0.12) - 0.006, -t, 0);
    b.castShadow = true;
    g.add(b);
  }
  g.userData.topY = 0;
  return g;
}

// ---------------------------------------------------------------------------------------------
// seating & soft furnishings
// ---------------------------------------------------------------------------------------------
/**
 * Upholstered armchair (wingback-ish). opts: color (velvet colour), wood (leg material), w.
 * userData: { seat (cushion Mesh), seatY }
 */
export function armchair({ color = M.palette.velvet, wood = M.walnut(), w = 0.86 } = {}) {
  const g = new THREE.Group(); g.name = 'armchair';
  const fab = M.velvet({ color });
  const d = 0.82, seatY = 0.44;
  const base = rbox(w, 0.24, d, fab, 0.05); base.position.y = 0.17 + 0.12; g.add(base);
  const seat = rbox(w - 0.24, 0.13, d - 0.18, fab, 0.055); seat.position.set(0, seatY - 0.02, 0.06); g.add(seat);
  const back = rbox(w, 0.78, 0.2, fab, 0.07); back.position.set(0, 0.29 + 0.39 + 0.05, -d / 2 + 0.1); back.rotation.x = -0.1; g.add(back);
  const backCush = rbox(w - 0.26, 0.55, 0.12, fab, 0.06); backCush.position.set(0, 0.74, -d / 2 + 0.22); backCush.rotation.x = -0.12; g.add(backCush);
  for (const s of [-1, 1]) {
    const arm = rbox(0.13, 0.26, d - 0.04, fab, 0.05); arm.position.set(s * (w / 2 - 0.065), 0.5, 0.01); g.add(arm);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, d - 0.02, 20), fab);
    roll.rotation.x = Math.PI / 2; roll.position.set(s * (w / 2 - 0.06), 0.62, 0.02); roll.castShadow = true; g.add(roll);
    const wing = rbox(0.1, 0.42, 0.34, fab, 0.045); wing.position.set(s * (w / 2 - 0.06), 0.88, -d / 2 + 0.2); wing.rotation.z = s * -0.08; g.add(wing);
    for (const z of [-1, 1]) {
      const leg = lathe([[0, 0], [0.018, 0], [0.024, 0.04], [0.03, 0.12], [0.034, 0.17], [0, 0.17]], wood, 12);
      leg.position.set(s * (w / 2 - 0.07), 0, z * (d / 2 - 0.08)); g.add(leg);
    }
  }
  // brass nailhead trim along the front of the arms
  const nail = new THREE.SphereGeometry(0.006, 8, 6);
  const nails = [];
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI;
    const ng = nail.clone(); ng.translate(s * (w / 2 - 0.06) + Math.cos(a) * 0.07, 0.62 + Math.sin(a) * 0.07 - 0.01, d / 2 - 0.005);
    nails.push(ng);
  }
  g.add(new THREE.Mesh(mergeGeometries(nails), M.brass()));
  g.userData.seat = seat;
  g.userData.seatY = seatY + 0.045;
  return g;
}

/** Throw cushion. opts: w, h, d, color, faceTexture (CanvasTexture for the +Z face, e.g. embroidery). */
export function cushion({ w = 0.4, h = 0.4, d = 0.13, color = '#c9a24a', faceTexture = null } = {}) {
  const g = new THREE.Group(); g.name = 'cushion';
  const fab = M.velvet({ color });
  const body = rbox(w, h, d, fab, Math.min(d / 2 - 0.001, 0.06));
  g.add(body);
  if (faceTexture) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.8), new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.9, transparent: true }));
    face.position.z = d / 2 + 0.002;
    g.add(face);
    g.userData.face = face;
  }
  // corner tassels
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 8), M.brass());
    t.position.set(sx * (w / 2), sy * (h / 2), 0); t.rotation.z = Math.atan2(sy, sx) - Math.PI / 2; g.add(t);
  }
  g.userData.body = body;
  return g;
}

/** Patterned rug. opts: w, d, base, accent, dark. Flat on the floor (y ≈ 0.005). */
export function rug({ w = 1.8, d = 2.6, base = '#6e1d1f', accent = '#c9a24a', dark = '#2a1410' } = {}) {
  const tex = rugTexture({ base, accent, dark, w: 512, h: Math.round(512 * d / w) });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const m = rbox(w, 0.012, d, mat, 0.005);
  m.position.y = 0.006; m.castShadow = false;
  const g = new THREE.Group(); g.name = 'rug'; g.add(m);
  return g;
}

// ---------------------------------------------------------------------------------------------
// candles
// ---------------------------------------------------------------------------------------------
const flameVert = /* glsl */`
  uniform float uTime; uniform float uSeed; varying vec2 vUv; varying float vH;
  void main(){
    vUv = uv; vec3 p = position;
    float h = clamp(p.y / 0.05, 0.0, 1.0); vH = h;
    p.x += sin(uTime * 9.0 + uSeed) * 0.003 * h * h;
    p.z += cos(uTime * 7.0 + uSeed * 2.0) * 0.002 * h * h;
    p.y *= 1.0 + sin(uTime * 13.0 + uSeed) * 0.06;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const flameFrag = /* glsl */`
  uniform vec3 uColor; uniform float uIntensity; varying float vH;
  void main(){
    vec3 core = vec3(1.0, 0.95, 0.8);
    vec3 col = mix(core, uColor, smoothstep(0.1, 0.7, vH));
    float a = (1.0 - smoothstep(0.55, 1.0, vH)) * 0.9 + 0.1;
    gl_FragColor = vec4(col * uIntensity * a, 1.0);
  }`;
function flameMesh(scale = 1, color = '#ff9a40') {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = Math.sin(Math.pow(t, 0.7) * Math.PI) * 0.0085 * (1 - t * 0.35);
    pts.push(new THREE.Vector2(r * scale, t * 0.05 * scale));
  }
  const geo = new THREE.LatheGeometry(pts, 12);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: 3.0 } },
    vertexShader: flameVert, fragmentShader: flameFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.raycast = () => {};
  m.userData.noRaycast = true;
  // soft halo sprite
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(color).multiplyScalar(0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.12 * scale); halo.position.y = 0.022 * scale;
  halo.raycast = () => {};
  m.add(halo);
  m.userData.halo = halo;
  return m;
}
let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,170,0.55)'); gr.addColorStop(0.35, 'rgba(255,170,90,0.18)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _halo = canvasTexture(c);
  return _halo;
}

/**
 * Candle with animated flame and (optional) flickering point light.
 * opts: h (wax height), r (wax radius), holder: 'stick'|'dish'|'none', light (bool), intensity, distance, lit, color, waxColor, castShadow
 * userData: { flame, light, setLit(bool), lit, flameY (local y of flame base), update }
 * Note: setLit fades the light intensity rather than toggling visibility (no shader recompiles).
 */
export function candle({ h = 0.16, r = 0.022, holder = 'stick', light = true, intensity = 1.1, distance = 3.5, lit = true, color = '#ff9a40', waxColor = M.palette.wax, castShadow = false } = {}) {
  const g = new THREE.Group(); g.name = 'candle';
  let baseY = 0;
  if (holder === 'stick') {
    const stick = lathe([[0, 0], [0.055, 0], [0.058, 0.008], [0.04, 0.016], [0.012, 0.03], [0.009, 0.06], [0.016, 0.075], [0.009, 0.09], [0.01, 0.15], [0.03, 0.16], [0.032, 0.17], [0.02, 0.172], [0, 0.172]], M.brass(), 20);
    g.add(stick); baseY = 0.17;
  } else if (holder === 'dish') {
    const dish = lathe([[0, 0], [0.06, 0], [0.065, 0.012], [0.058, 0.014], [0.03, 0.01], [0.03, 0.03], [0, 0.03]], M.brass(), 20);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 16), M.brass());
    ring.position.set(0.07, 0.01, 0); ring.rotation.x = Math.PI / 2;
    g.add(dish, ring); baseY = 0.012;
  }
  // wax with a melted top and drips
  const prof = [[0, 0], [r, 0], [r, h * 0.9], [r * 0.98, h * 0.97], [r * 0.8, h], [r * 0.3, h * 0.985], [0, h * 0.98]];
  const wax = lathe(prof, M.wax({ color: waxColor }), 18);
  wax.position.y = baseY;
  g.add(wax);
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2, len = h * (0.2 + Math.random() * 0.35);
    const drip = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.13, len, 3, 6), M.wax({ color: waxColor }));
    drip.position.set(Math.cos(a) * r * 0.98, baseY + h - len / 2 - 0.006, Math.sin(a) * r * 0.98);
    g.add(drip);
  }
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 5), M.matte('#1a1008'));
  wick.position.y = baseY + h + 0.004;
  g.add(wick);
  const flameY = baseY + h + 0.004;
  const flame = flameMesh(1, color);
  flame.position.y = flameY;
  g.add(flame);
  let pl = null;
  if (light) {
    pl = flickerLight({ color: '#ffa252', intensity, distance, castShadow });
    pl.position.y = flameY + 0.06;
    g.add(pl);
  }
  let litNow = lit, k = lit ? 1 : 0;
  g.userData.flame = flame;
  g.userData.light = pl;
  g.userData.flameY = flameY;
  g.userData.lit = lit;
  g.userData.setLit = (b) => { litNow = !!b; g.userData.lit = litNow; pl?.userData.setLit(litNow, 0.25); };
  if (!lit) pl?.userData.setLit(false, 0);
  g.userData.update = (dt, t) => {
    k += ((litNow ? 1 : 0) - k) * Math.min(1, dt * 8);
    flame.visible = k > 0.02;
    flame.scale.setScalar(Math.max(0.001, k));
    flame.material.uniforms.uTime.value = t;
    flame.userData.halo.material.opacity = k * (0.85 + Math.sin(t * 11 + flame.material.uniforms.uSeed.value) * 0.15);
    pl?.userData.update(dt, t);
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// frames, doors, windows
// ---------------------------------------------------------------------------------------------
/**
 * Picture frame on a wall, facing +Z, origin at the frame's centre-back.
 * opts: w, h (outer), border, depth, style: 'gilt'|'walnut'|'iron', draw(ctx2d, pw, ph) to paint the canvas,
 *       texture (instead of draw), px (canvas resolution of the longer side)
 * userData: { canvas (Mesh, has userData.redraw()), innerW, innerH }
 */
export function pictureFrame({ w = 0.6, h = 0.8, border = 0.07, depth = 0.05, style = 'gilt', draw = null, texture = null, px = 512 } = {}) {
  const g = new THREE.Group(); g.name = 'pictureFrame';
  const mat = style === 'gilt' ? M.gold({ roughness: 0.35 }) : style === 'iron' ? M.iron() : M.walnut();
  const top = rbox(w, border, depth, mat, Math.min(0.015, border / 3)); top.position.set(0, h / 2 - border / 2, depth / 2);
  const bot = top.clone(); bot.position.y = -h / 2 + border / 2;
  const left = rbox(border, h - border * 2 + 0.002, depth, mat, Math.min(0.015, border / 3)); left.position.set(-w / 2 + border / 2, 0, depth / 2);
  const right = left.clone(); right.position.x = w / 2 - border / 2;
  g.add(top, bot, left, right);
  // inner lip
  const lipMat = style === 'gilt' ? M.brass({ color: '#9a7a32' }) : M.walnut({ tint: M.palette.walnutDark });
  const lw = w - border * 2, lh = h - border * 2, lt = 0.012;
  for (const [x, y, ww, hh] of [[0, lh / 2 - lt / 2, lw, lt], [0, -lh / 2 + lt / 2, lw, lt], [-lw / 2 + lt / 2, 0, lt, lh], [lw / 2 - lt / 2, 0, lt, lh]]) {
    const b = rbox(ww, hh, depth * 0.6, lipMat, 0.003); b.position.set(x, y, depth * 0.3); g.add(b);
  }
  const iw = lw - lt * 2, ih = lh - lt * 2;
  let tex = texture;
  let redraw = () => {};
  let canvas = null;
  if (!tex) {
    const pw = Math.round(iw >= ih ? px : px * iw / ih), ph = Math.round(ih >= iw ? px : px * ih / iw);
    canvas = makeCanvas(pw, ph);
    const c2 = canvas.getContext('2d');
    const paint = () => {
      if (draw) draw(c2, pw, ph);
      else { const gr = c2.createLinearGradient(0, 0, 0, ph); gr.addColorStop(0, '#3a2a1e'); gr.addColorStop(1, '#1a120c'); c2.fillStyle = gr; c2.fillRect(0, 0, pw, ph); }
    };
    paint();
    tex = canvasTexture(canvas);
    redraw = () => { paint(); tex.needsUpdate = true; };
  }
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
  pic.position.z = depth * 0.25;
  pic.receiveShadow = true;
  pic.userData.redraw = redraw;
  pic.userData.canvas = canvas;
  g.add(pic);
  g.userData.canvas = pic;
  g.userData.innerW = iw; g.userData.innerH = ih;
  return g;
}

/** Draws a glowing rune sigil (white on transparent) into a canvas texture. Tint via material colour. */
export function runeTexture(seed = 1) {
  const c = makeCanvas(256, 256), g = c.getContext('2d'), r = rng(seed);
  g.translate(128, 128);
  g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = '#fff'; g.shadowBlur = 12;
  g.lineWidth = 6;
  g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 86, 0, Math.PI * 2); g.stroke();
  // tick marks
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 86, Math.sin(a) * 86); g.lineTo(Math.cos(a) * (i % 3 ? 80 : 72), Math.sin(a) * (i % 3 ? 80 : 72)); g.stroke(); }
  // central glyph: random-ish strokes, symmetric
  g.lineWidth = 7;
  const pts = [];
  for (let i = 0; i < 5; i++) pts.push([(r() - 0.5) * 90, (r() - 0.5) * 110]);
  for (const sx of [1, -1]) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * sx * 0.6, y) : g.moveTo(x * sx * 0.6, y)));
    g.stroke();
  }
  g.beginPath(); g.moveTo(0, -60); g.lineTo(0, 60); g.stroke();
  g.beginPath(); g.arc(0, -10, 18, 0, Math.PI * 2); g.stroke();
  return canvasTexture(c);
}

/**
 * Heavy plank door with iron bands in a frame. Origin: bottom centre of the doorway, front +Z.
 * opts: w, h, material (plank wood tint), bands (bool), rune (bool), runeColor, frame: 'stone'|'wood'|null, seed
 * userData: { leaf (Group, pivots at the hinge on the LEFT edge — tween leaf.rotation.y to e.g. -1.4 to swing open
 *             into the room), rune (Mesh|null), setRune(intensity 0..1, seconds?) — fades the rune, runeIntensity }
 */
export function door({ w = 1.1, h = 2.15, tint = '#6a4426', bands = true, rune = false, runeColor = '#bfe0ff', frame = 'stone', seed = 2 } = {}) {
  const g = new THREE.Group(); g.name = 'door';
  const t = 0.07;
  // darkness behind the leaf
  const voidM = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.matte('#050302'));
  voidM.position.set(0, h / 2, -0.06);
  g.add(voidM);
  const leaf = new THREE.Group(); leaf.name = 'doorLeaf';
  leaf.position.set(-w / 2, 0, 0);
  g.add(leaf);
  const planks = 5, pw = w / planks;
  const pm = M.wood({ tint, seed, roughness: 0.7 });
  const r = rng(seed);
  for (let i = 0; i < planks; i++) {
    const geo = rotateUV(roundedBoxGeometry(pw - 0.004, h - 0.01, t, 0.008));
    const p = new THREE.Mesh(geo, pm);
    p.position.set(pw * (i + 0.5), h / 2, (r() - 0.5) * 0.004);
    p.castShadow = true; p.receiveShadow = true;
    leaf.add(p);
  }
  if (bands) {
    const im = M.iron();
    const rivetGeos = [];
    for (const y of [0.25, h / 2, h - 0.3]) {
      const b = rbox(w - 0.02, 0.075, 0.012, im, 0.004);
      b.position.set(w / 2, y, t / 2 + 0.006);
      leaf.add(b);
      // strap-hinge flare on the hinge side
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.11, 10), im);
      hinge.position.set(0.005, y, t / 2); leaf.add(hinge);
      for (let k = 0; k < 6; k++) {
        const rg = new THREE.SphereGeometry(0.009, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        rg.rotateX(Math.PI / 2);
        rg.translate(0.08 + k * ((w - 0.16) / 5), y, t / 2 + 0.012);
        rivetGeos.push(rg);
      }
    }
    leaf.add(new THREE.Mesh(mergeGeometries(rivetGeos), im));
  }
  // ring handle + keyhole plate
  const hm = M.iron({ color: '#2e2b28' });
  const plate = rbox(0.09, 0.16, 0.01, hm, 0.004); plate.position.set(w - 0.14, h * 0.47, t / 2 + 0.01); leaf.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 10, 24), M.brass({ color: '#a8843a' }));
  ring.position.set(w - 0.14, h * 0.47 - 0.04, t / 2 + 0.03); leaf.add(ring);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), M.brass({ color: '#a8843a' }));
  boss.position.set(w - 0.14, h * 0.47 + 0.005, t / 2 + 0.018); leaf.add(boss);
  shadowAll(leaf);
  // frame
  if (frame) {
    const fm = frame === 'stone' ? M.smoothStone({ color: '#7d766b' }) : M.walnut();
    const fw = frame === 'stone' ? 0.16 : 0.09, fd = 0.2;
    const l = rbox(fw, h + fw, fd, fm, 0.02); l.position.set(-w / 2 - fw / 2, (h + fw) / 2, -0.04);
    const rr = l.clone(); rr.position.x = w / 2 + fw / 2;
    const top = rbox(w + fw * 2 + 0.04, fw, fd + 0.02, fm, 0.02); top.position.set(0, h + fw / 2, -0.035);
    g.add(l, rr, top);
    if (frame === 'stone') {
      const key = rbox(0.16, 0.22, fd + 0.04, fm, 0.02); key.position.set(0, h + fw / 2 + 0.02, -0.03); g.add(key);
    }
    const step = rbox(w + fw * 2, 0.04, 0.3, M.smoothStone({ color: '#6d665c' }), 0.01); step.position.set(0, 0.02, 0.02); g.add(step);
  }
  let runeMesh = null;
  if (rune) {
    const rm = new THREE.MeshBasicMaterial({ map: runeTexture(seed), color: new THREE.Color(runeColor).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    runeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), rm);
    runeMesh.position.set(w / 2, h * 0.62, t / 2 + 0.02);
    runeMesh.userData.noHighlight = true;
    leaf.add(runeMesh);
    const base = rm.color.clone();
    g.userData.runeIntensity = 1;
    let pulse = 0;
    g.userData.update = (dt, tt) => {
      pulse = tt;
      const k = g.userData.runeIntensity * (0.85 + 0.15 * Math.sin(tt * 2.2));
      rm.color.copy(base).multiplyScalar(k);
      runeMesh.visible = g.userData.runeIntensity > 0.01;
    };
  }
  g.userData.leaf = leaf;
  g.userData.rune = runeMesh;
  g.userData.setRune = (v, seconds = 0) => {
    if (!seconds) { g.userData.runeIntensity = v; return Promise.resolve(); }
    const from = g.userData.runeIntensity;
    return new Promise((res) => {
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        // flicker on the way out
        g.userData.runeIntensity = from + (v - from) * k + (k < 1 ? (Math.random() - 0.5) * 0.4 * (1 - k) : 0);
        if (k < 1) requestAnimationFrame(step); else { g.userData.runeIntensity = v; res(); }
      };
      step();
    });
  };
  return g;
}

const skyVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = /* glsl */`
  uniform float uTime; uniform float uRain; uniform vec3 uTop; uniform vec3 uBottom; uniform vec2 uMoon; uniform vec2 uAspect;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, uv.y));
    // stars
    vec2 g = floor(uv * uAspect * 40.0); vec2 f = fract(uv * uAspect * 40.0);
    float h = hash(g);
    if (h > 0.93) { float d = length(f - vec2(0.5)); col += vec3(0.9, 0.95, 1.0) * smoothstep(0.12, 0.0, d) * (0.5 + 0.5 * sin(uTime * 2.0 + h * 50.0)); }
    // moon glow
    vec2 md = (uv - uMoon) * uAspect;
    float m = length(md);
    col += vec3(0.7, 0.8, 1.0) * (smoothstep(0.09, 0.075, m) * 1.4 + 0.25 * exp(-m * 6.0));
    // rain streaks
    if (uRain > 0.0) {
      vec2 ru = uv * uAspect * vec2(28.0, 3.0);
      float col_i = floor(ru.x);
      float speed = 0.6 + hash(vec2(col_i, 1.0)) * 0.8;
      float y = fract(ru.y * 0.5 + uTime * speed * 0.35 + hash(vec2(col_i, 2.0)));
      float streak = smoothstep(0.08, 0.0, abs(fract(ru.x) - 0.5)) * smoothstep(0.0, 0.25, y) * smoothstep(0.45, 0.25, y);
      col += vec3(0.55, 0.65, 0.8) * streak * 0.35 * uRain;
      // static droplets
      vec2 dg = floor(uv * uAspect * 22.0); vec2 df = fract(uv * uAspect * 22.0);
      float dh = hash(dg + 7.0);
      if (dh > 0.85) col += vec3(0.6, 0.7, 0.9) * smoothstep(0.18, 0.05, length(df - vec2(0.5))) * 0.25 * uRain;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

/**
 * Tall window with frame, mullions, a moonlit night sky (animated stars/rain) and an optional moonlight shaft.
 * Origin: bottom centre of the window opening (place it on the wall at sill height, front +Z).
 * opts: w, h, arch (bool, round top), panes: [cols, rows], frameMaterial, sill (bool), rain (0..1),
 *       moonlight (bool), shaftTarget ([x,y,z] local point the shaft lands on), shaftOpacity, skyTop, skyBottom, moon ([u,v])
 * userData: { glass (Mesh, ShaderMaterial), shaft (Mesh|null), setRain(v) }
 */
export function windowFrame({ w = 1.0, h = 1.8, arch = true, panes = [2, 3], frameMaterial = M.walnut(), sill = true, rain = 0, moonlight = true, shaftTarget = null, shaftOpacity = 0.14, skyTop = '#0b1530', skyBottom = '#1d2c55', moon = [0.7, 0.78] } = {}) {
  const g = new THREE.Group(); g.name = 'window';
  const fw = 0.07, fd = 0.12;
  const rectH = arch ? h - w / 2 : h;
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uRain: { value: rain }, uTop: { value: new THREE.Color(skyTop) }, uBottom: { value: new THREE.Color(skyBottom) },
      uMoon: { value: new THREE.Vector2(...moon) }, uAspect: { value: new THREE.Vector2(w / h, 1) },
    },
    vertexShader: skyVert, fragmentShader: skyFrag, toneMapped: false,
  });
  // glass shape: rectangle + half disc
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, rectH);
  if (arch) shape.absarc(0, rectH, w / 2, 0, Math.PI, false); else shape.lineTo(-w / 2, rectH);
  shape.lineTo(-w / 2, 0);
  const sg = new THREE.ShapeGeometry(shape, 24);
  // planar UVs 0..1
  const pos = sg.attributes.position, uv = sg.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  const glass = new THREE.Mesh(sg, skyMat);
  glass.position.z = -0.02;
  g.add(glass);
  // frame
  const side = rbox(fw, rectH, fd, frameMaterial, 0.012);
  const l = side.clone(); l.position.set(-w / 2 - fw / 2 + 0.01, rectH / 2, 0);
  const r = side.clone(); r.position.set(w / 2 + fw / 2 - 0.01, rectH / 2, 0);
  const bottom = rbox(w + fw * 2, fw, fd, frameMaterial, 0.012); bottom.position.set(0, -fw / 2 + 0.01, 0);
  g.add(l, r, bottom);
  if (arch) {
    const archG = new THREE.TorusGeometry(w / 2 + fw / 2 - 0.01, fw / 2, 10, 32, Math.PI);
    archG.scale(1, 1, fd / fw);
    const a = new THREE.Mesh(archG, frameMaterial); a.position.set(0, rectH, 0); a.castShadow = true; g.add(a);
  } else {
    const top = rbox(w + fw * 2, fw, fd, frameMaterial, 0.012); top.position.set(0, rectH + fw / 2 - 0.01, 0); g.add(top);
  }
  // mullions (thin lead/wood bars)
  const mm = M.iron({ color: '#2a2622' });
  const [cols, rows] = panes;
  for (let i = 1; i < cols; i++) { const b = rbox(0.022, h - 0.02, 0.03, mm, 0.004); b.position.set(-w / 2 + (w * i) / cols, h / 2 - 0.01 - (arch ? 0 : 0), 0); if (arch) { b.scale.y = (rectH + w / 2 * Math.sqrt(1 - Math.pow((w * i / cols - w / 2) / (w / 2), 2))) / (h - 0.02); b.position.y = (b.scale.y * (h - 0.02)) / 2; } g.add(b); }
  for (let j = 1; j <= rows; j++) {
    const y = (rectH * j) / rows;
    if (j === rows && arch) { const b = rbox(w, 0.022, 0.03, mm, 0.004); b.position.set(0, y, 0); g.add(b); continue; }
    if (j === rows) continue;
    const b = rbox(w, 0.022, 0.03, mm, 0.004); b.position.set(0, y, 0); g.add(b);
  }
  if (sill) {
    const s = rbox(w + fw * 2 + 0.12, 0.05, 0.26, M.smoothStone({ color: '#8a8378' }), 0.012);
    s.position.set(0, -fw - 0.005, 0.08);
    g.add(s);
  }
  let shaft = null;
  if (moonlight) {
    const to = shaftTarget || [w * 0.5, -1.0, 2.4];
    shaft = lightShaft({ from: [0, rectH * 0.55, 0.05], to, radiusTop: w * 0.55, radiusBottom: w * 0.85, opacity: shaftOpacity });
    g.add(shaft);
  }
  g.userData.glass = glass;
  g.userData.shaft = shaft;
  g.userData.setRain = (v) => { skyMat.uniforms.uRain.value = v; };
  g.userData.update = (dt, t) => { skyMat.uniforms.uTime.value = t; shaft?.userData.update(dt, t); };
  return g;
}

// ---------------------------------------------------------------------------------------------
// glassware
// ---------------------------------------------------------------------------------------------
function curvedLabel(text, r, h, { color = '#efe2c0', ink = '#2b1a10', arc = 1.5 } = {}) {
  const tex = labelTexture(text, { w: 256, h: 160, bg: color, color: ink });
  const geo = new THREE.CylinderGeometry(r, r, h, 16, 1, true, -arc / 2, arc);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  return m;
}

/**
 * Glass jar with contents, lid and an optional curved paper label (front +Z).
 * opts: r, h, contents (colour or null), fill (0..1), glow (emissive 0..2), label (text, '\n' ok), labelColor, lid: 'cork'|'brass'|'cloth'|'none'
 * userData: { contents (Mesh|null), lid (Mesh|Group), label (Mesh|null), setContents(color, glow, fill) }
 */
export function jar({ r = 0.06, h = 0.16, contents = '#7a9a6a', fill = 0.7, glow = 0, label = null, labelColor = '#efe2c0', lid = 'cork' } = {}) {
  const g = new THREE.Group(); g.name = 'jar';
  const prof = [[0, 0.002], [r * 0.85, 0], [r, r * 0.25], [r, h * 0.8], [r * 0.82, h * 0.9], [r * 0.72, h * 0.92], [r * 0.72, h], [r * 0.78, h * 1.01]];
  const glassM = lathe(prof, M.glass(), 24);
  glassM.castShadow = false;
  glassM.renderOrder = 2;
  let cont = null;
  const contMat = contents ? new THREE.MeshStandardMaterial({ color: contents, emissive: contents, emissiveIntensity: glow, roughness: 0.6 }) : null;
  if (contents) {
    cont = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.84, h * 0.8 * fill, 20), contMat);
    cont.position.y = 0.004 + (h * 0.8 * fill) / 2;
    cont.receiveShadow = true;
    g.add(cont);
  }
  g.add(glassM);
  let lidM;
  if (lid === 'cork') { lidM = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.74, r * 0.66, r * 0.5, 16), M.matte('#b48a5a', { roughness: 0.95 })); lidM.position.y = h + r * 0.12; }
  else if (lid === 'brass') { lidM = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 0.35, 20), M.brass()); lidM.position.y = h + r * 0.1; }
  else if (lid === 'cloth') {
    lidM = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(r * 1.05, r * 0.6, 16, 1, true), M.matte('#b7a07a'));
    cloth.position.y = h + r * 0.1; lidM.add(cloth);
    const string = new THREE.Mesh(new THREE.TorusGeometry(r * 0.74, 0.0025, 6, 20), M.matte('#7a2a1a'));
    string.rotation.x = Math.PI / 2; string.position.y = h * 0.96; lidM.add(string);
  }
  if (lidM) { lidM.castShadow = true; g.add(lidM); }
  let labelM = null;
  if (label) {
    labelM = curvedLabel(label, r * 1.005, h * 0.42, { color: labelColor });
    labelM.position.y = h * 0.42;
    g.add(labelM);
  }
  g.userData.contents = cont;
  g.userData.lid = lidM;
  g.userData.label = labelM;
  g.userData.setContents = (color, glw = glow, f = fill) => {
    if (!cont) return;
    contMat.color.set(color); contMat.emissive.set(color); contMat.emissiveIntensity = glw;
    cont.scale.y = Math.max(0.001, f / fill);
    cont.position.y = 0.004 + (h * 0.8 * f) / 2;
  };
  return g;
}

/**
 * Bottle (potion/wine/ink). opts: r, h, color (glass tint), contents, glow, label, cork (bool), shape: 'round'|'tall'|'flask'
 * userData: { contents, label }
 */
export function bottle({ r = 0.045, h = 0.24, color = '#4a7a5a', contents = null, glow = 0, label = null, cork = true, shape = 'tall' } = {}) {
  const g = new THREE.Group(); g.name = 'bottle';
  let prof;
  if (shape === 'flask') prof = [[0, 0.002], [r * 0.6, 0], [r * 1.25, r * 0.6], [r * 1.3, r * 1.3], [r * 0.9, r * 2.1], [r * 0.32, h * 0.72], [r * 0.3, h], [r * 0.36, h * 1.01]];
  else if (shape === 'round') prof = [[0, 0.002], [r * 0.7, 0], [r * 1.15, r * 0.7], [r * 1.1, r * 1.5], [r * 0.5, r * 2.2], [r * 0.3, h * 0.8], [r * 0.3, h], [r * 0.36, h * 1.01]];
  else prof = [[0, 0.002], [r * 0.95, 0], [r, r * 0.3], [r, h * 0.6], [r * 0.8, h * 0.72], [r * 0.32, h * 0.8], [r * 0.3, h], [r * 0.36, h * 1.01]];
  const gm = lathe(prof, M.glass({ color, opacity: 0.4 }), 22);
  gm.castShadow = false; gm.renderOrder = 2;
  let cont = null;
  if (contents) {
    const cp = prof.filter(([, y]) => y < h * 0.55).map(([x, y]) => [x * 0.9, y + 0.003]);
    cp.push([cp[cp.length - 1][0], h * 0.55], [0, h * 0.55]);
    cont = lathe(cp, new THREE.MeshStandardMaterial({ color: contents, emissive: contents, emissiveIntensity: glow, roughness: 0.4, transparent: true, opacity: 0.92 }), 18);
    g.add(cont);
  }
  g.add(gm);
  if (cork) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.34, r * 0.28, r * 0.6, 12), M.matte('#b48a5a'));
    c.position.y = h + r * 0.15; c.castShadow = true; g.add(c);
  }
  let labelM = null;
  if (label) {
    const lr = shape === 'tall' ? r * 1.01 : r * 1.1;
    labelM = curvedLabel(label, lr, shape === 'tall' ? h * 0.25 : r * 0.9, { arc: 1.3 });
    labelM.position.y = shape === 'tall' ? h * 0.32 : r * 1.0;
    g.add(labelM);
  }
  g.userData.contents = cont;
  g.userData.label = labelM;
  return g;
}

/**
 * Turned stone (or wood) pedestal. opts: h, r, material.
 * userData: { topY }
 */
export function pedestal({ h = 1.0, r = 0.2, material = M.smoothStone() } = {}) {
  const prof = [
    [0, 0], [r * 1.35, 0], [r * 1.35, h * 0.06], [r * 1.2, h * 0.08], [r * 1.15, h * 0.12], [r * 0.85, h * 0.16],
    [r * 0.7, h * 0.2], [r * 0.62, h * 0.5], [r * 0.7, h * 0.8], [r * 0.85, h * 0.85], [r * 1.15, h * 0.9], [r * 1.3, h * 0.93], [r * 1.3, h], [0, h],
  ];
  const g = new THREE.Group(); g.name = 'pedestal';
  g.add(lathe(prof, material, 28));
  g.userData.topY = h;
  return g;
}

// ---------------------------------------------------------------------------------------------
// room shell
// ---------------------------------------------------------------------------------------------
/**
 * Floor, four walls, ceiling (+ beams, baseboards, optional wainscot). Origin at floor centre.
 * Walls: north = -Z (back), south = +Z (behind a vantage near +Z), west = -X (left), east = +X (right).
 * opts: w (x), d (z), h, floor: Material, wall: Material, ceiling: Material|null, beams (count), wainscot (height m or 0),
 *       baseboard (bool), omit: ['south', ...] walls to skip
 * userData: { floor, ceiling, walls: { north, south, east, west } }
 */
export function roomShell({ w = 6, d = 6, h = 4, floor, wall, ceiling, beams = 4, wainscot = 0, baseboard = true, omit = [] } = {}) {
  const g = new THREE.Group(); g.name = 'roomShell';
  floor = floor || M.floorboards({ repeat: [w / 3, d / 3] });
  wall = wall || M.plaster({ repeat: [w / 3, h / 3] });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floor);
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.name = 'floor';
  g.add(fl);
  const walls = {};
  const mk = (name, len, x, z, ry) => {
    if (omit.includes(name)) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wall);
    m.position.set(x, h / 2, z); m.rotation.y = ry; m.receiveShadow = true; m.name = `wall_${name}`;
    g.add(m); walls[name] = m;
    if (baseboard) {
      const b = rbox(len, 0.14, 0.03, M.walnut(), 0.006);
      b.position.set(x, 0.07, z); b.rotation.y = ry; b.translateZ(0.015);
      g.add(b);
    }
    if (wainscot > 0) {
      const p = rbox(len, wainscot, 0.025, M.walnut({ tint: '#4a2f1e' }), 0.004);
      p.position.set(x, wainscot / 2, z); p.rotation.y = ry; p.translateZ(0.012);
      g.add(p);
      const rail = rbox(len, 0.05, 0.05, M.walnut(), 0.01);
      rail.position.set(x, wainscot, z); rail.rotation.y = ry; rail.translateZ(0.025);
      g.add(rail);
    }
  };
  mk('north', w, 0, -d / 2, 0);
  mk('south', w, 0, d / 2, Math.PI);
  mk('west', d, -w / 2, 0, Math.PI / 2);
  mk('east', d, w / 2, 0, -Math.PI / 2);
  let ceil = null;
  if (ceiling !== null) {
    ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceiling || M.plaster({ tint: '#8a7a62', repeat: [w / 3, d / 3] }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = h; ceil.name = 'ceiling';
    g.add(ceil);
    for (let i = 0; i < beams; i++) {
      const b = rbox(w, 0.22, 0.18, M.walnut({ tint: '#3a2416' }), 0.02);
      b.position.set(0, h - 0.11, -d / 2 + (d * (i + 0.5)) / beams);
      g.add(b);
    }
  }
  g.userData = { ...g.userData, floor: fl, ceiling: ceil, walls };
  return g;
}

export { shadowAll };
