// Helpers shared by the rooms: moon-phase drawing, static-mesh merging, the carried lantern light, textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, canvasTexture, rng } from '../engine/props/textures.js';
import * as M from '../engine/props/materials.js';
import * as F from '../engine/props/furniture.js';

const TAU = Math.PI * 2;

/**
 * Draw a moon at phase 0..7 (0 new, 2 first quarter, 4 full, 6 last quarter). Waxing moons are lit on the right.
 */
export function drawMoon(g, cx, cy, r, phase, { dark = '#17141f', light = '#f0e6c4' } = {}) {
  g.save();
  g.fillStyle = dark; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  if (phase === 0) {
    // new moon: earthshine, so the disc still reads as a moon and not a hole
    g.fillStyle = 'rgba(240,230,196,0.12)'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(240,230,196,0.35)'; g.lineWidth = Math.max(1, r * 0.07); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    g.restore(); return;
  }
  if (phase === 4) { g.fillStyle = light; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.restore(); return; }
  const waxing = phase < 4;
  // lit half on the lit side
  g.fillStyle = light; g.beginPath();
  if (waxing) g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); else g.arc(cx, cy, r, Math.PI / 2, (3 * Math.PI) / 2);
  g.closePath(); g.fill();
  // the terminator: an ellipse that eats into the lit half (crescent) or adds to the dark half (gibbous)
  // 0.25 crescent, 0.5 quarter, 0.75 gibbous; waning runs back down (5 gibbous, 6 quarter, 7 crescent)
  const k = (waxing ? phase : 8 - phase) / 4;
  const rx = Math.abs(Math.cos(k * Math.PI)) * r;
  if (rx > 0.001) {
    const crescent = k < 0.5;
    g.fillStyle = crescent ? dark : light;
    g.beginPath(); g.ellipse(cx, cy, rx, r, 0, 0, TAU); g.fill();
  }
  // a soft rim so the dark side still reads as a sphere
  g.strokeStyle = 'rgba(240,230,196,0.25)'; g.lineWidth = Math.max(1, r * 0.06); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.restore();
}

/** Merge static meshes under `root` by material (draw-call saver). Excluded objects and anything with userData.keep stay. */
export function mergeStatic(root, exclude = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const ex = new Set(exclude);
  const skip = (o) => { for (let p = o; p && p !== root; p = p.parent) if (ex.has(p) || p.userData.keep) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || skip(o)) return;
    const m = o.material;
    if (Array.isArray(m) || m.transparent || m.isShaderMaterial || m.visible === false || o.userData.hitProxy || o.renderOrder || o.userData.noRaycast) return;
    if (typeof o.userData.update === 'function') return;
    const key = `${m.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.geometry.attributes.color ? 'c' : ''}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, list[0].material);
    mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow;
    mm.name = 'merged';
    for (const o of list) o.parent.remove(o);
    root.add(mm);
  }
  return root;
}

/**
 * The carried lantern: a warm point light that rides a little below and to the right of the camera while the
 * player holds the lantern. `set(true)` fades it up, `set(false)` fades it out; call update() each frame.
 */
export function carriedLight(ctx, parent) {
  const light = new THREE.PointLight('#ffb463', 0, 5.5, 2);
  light.castShadow = false;
  parent.add(light);
  let target = 0, cur = 0, flickerSeed = Math.random() * 100;
  const tmp = new THREE.Vector3(), right = new THREE.Vector3(), fwd = new THREE.Vector3();
  return {
    light,
    set(on) { target = on ? 1 : 0; },
    update(dt, t) {
      cur += (target - cur) * Math.min(1, dt * 2.5);
      const cam = ctx.camera.camera;
      cam.getWorldDirection(fwd);
      right.crossVectors(fwd, cam.up).normalize();
      tmp.copy(cam.position).addScaledVector(fwd, 0.5).addScaledVector(right, 0.35);
      tmp.y -= 0.45;
      parent.worldToLocal(tmp);
      light.position.copy(tmp);
      const flicker = 1 + 0.08 * Math.sin(t * 9.3 + flickerSeed) + 0.05 * Math.sin(t * 23.1 + flickerSeed * 2);
      light.intensity = 2.2 * cur * flicker;
    },
  };
}

/** Black-and-bone chequered tiles, slightly worn. */
export function tileTexture({ a = '#15110f', b = '#b7ab96', size = 512, n = 2 } = {}) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), r = rng(23);
  const cell = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * cell, y * cell, cell, cell);
    // wear: faint mottling and a darker grout line
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${(x + y) % 2 ? '200,190,170' : '0,0,0'},${r() * 0.08})`; g.fillRect(x * cell + r() * cell, y * cell + r() * cell, 3, 3); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
  }
  const t = canvasTexture(c, { repeat: [1, 1] }); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A damp damask wallpaper: a dark base with a repeating lighter motif and water stains. */
export function wallpaperTexture({ base = '#2a1f28', motif = '#3b2c36', seed = 3, size = 512 } = {}) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  g.fillStyle = motif;
  const cell = size / 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = x * cell + cell / 2 + ((y % 2) ? cell / 2 : 0), cy = y * cell + cell / 2;
    g.save(); g.translate(cx % size, cy);
    for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.ellipse(0, cell * 0.22, cell * 0.08, cell * 0.2, 0, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(0, 0, cell * 0.07, 0, TAU); g.fill();
    g.restore();
  }
  // stains
  for (let i = 0; i < 6; i++) {
    const gr = g.createRadialGradient(r() * size, r() * size, 0, r() * size, r() * size, size * (0.15 + r() * 0.2));
    gr.addColorStop(0, 'rgba(60,40,20,0.35)'); gr.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const t = canvasTexture(c, { repeat: [1, 1] }); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The guest lantern: iron, four bars, a lit candle inside (userData.flame). Origin at the base. */
export function lanternProp() {
  const g = new THREE.Group(); g.name = 'lantern';
  const iron = M.iron({ color: '#2a2724' });
  const base = F.lathe([[0.07, 0], [0.07, 0.015], [0.05, 0.02], [0.05, 0.03], [0, 0.03]], iron, 16); g.add(base);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.17, 14, 1, true), M.glass({ color: '#ffd9a0', opacity: 0.22 })); glass.position.y = 0.115; glass.renderOrder = 2; g.add(glass);
  for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.17, 0.006), iron); bar.position.set(Math.cos((i / 4) * TAU) * 0.05, 0.115, Math.sin((i / 4) * TAU) * 0.05); g.add(bar); }
  const cap = F.lathe([[0.065, 0.2], [0.05, 0.23], [0.02, 0.25], [0.012, 0.27], [0, 0.27]], iron, 14); g.add(cap);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.005, 6, 16, Math.PI), iron); handle.position.y = 0.27; g.add(handle);
  const flame = F.candle({ h: 0.05, r: 0.012, holder: 'none', light: true, intensity: 1.2, distance: 2.5, lit: true, castShadow: false }); flame.position.y = 0.03; g.add(flame);
  g.userData.flame = flame;
  return g;
}

/**
 * Take the ring handle and keyhole plate off an F.door() so a room can fit its own hardware (the parlour's letter
 * rings, the nursery door's knocker and pegs). The leaf keeps its planks (and bands, if any).
 */
export function stripDoorHardware(door) {
  const leaf = door.userData.leaf;
  if (!leaf) return door;
  // F.door adds them last, in order: plate, ring, boss
  const c = leaf.children;
  if (c.length >= 3 && c[c.length - 1].geometry?.type === 'SphereGeometry' && c[c.length - 2].geometry?.type === 'TorusGeometry') {
    for (let i = 0; i < 3; i++) leaf.remove(c[c.length - 1]);
  }
  return door;
}

/** Stand a figure on a stair: y for an x along a run that starts at x0 and climbs `steps` treads of `run` to `top` (the landing). */
export function stairY(x, { x0, rise, run, steps, top = (steps + 1) * rise }) {
  const k = Math.min(1, Math.max(0, (x - x0) / (run * steps)));
  return k * top;
}
