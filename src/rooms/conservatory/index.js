// THE CONSERVATORY (`conservatory`). See docs/SLICE.md.
//
// Layout (metres, floor centre origin, north = −Z; the player stands in the hall doorway at the west end looking east):
//   west  (−X): the house wall, the doors back to the foyer (always open)
//   north (−Z): the potting bench: pots, the watering can, the dead orchid; the thermometer on a rib
//   centre:     the dry fountain, a stone fish, a coin at the bottom
//   south (+Z): the wicker chair with Mr. Finch, his side table and cold cup; his bag on a hook on the rib
//   east  (+X): the garden door (pin lock), the moon behind it, rain on everything
// Locks: bag (three dials, 4 1 7), garden (five pins, 3 1 4 2 5, needs the wrench).
import * as THREE from 'three';
import { Room } from '../../engine/Room.js';
import * as M from '../../engine/props/materials.js';
import * as F from '../../engine/props/furniture.js';
import * as P from '../../engine/props/particles.js';
import * as L from '../../engine/props/lights.js';
import { makeCanvasPlane } from '../../engine/props/text.js';
import { rng, noiseTexture } from '../../engine/props/textures.js';
import { makeFigure } from '../../engine/props/figure.js';
import { cobweb } from '../foyer/clock.js';
import { mergeStatic, carriedLight, tileTexture, lanternProp } from '../shared.js';

const TAU = Math.PI * 2;
const W = 8, D = 5.6;            // floor
const PH = 0.85;                 // brick plinth height
const EH = 2.9, RH = 3.6;        // eaves, ridge
const BAG_SOLUTION = [4, 1, 7];
const PIN_ORDER = [2, 0, 3, 1, 4]; // 0-based: pins 3, 1, 4, 2, 5
const CHAIR = { pos: [0.5, 0, 1.95], yaw: Math.PI + 0.55 };

export default class Conservatory extends Room {
  static id = 'conservatory';
  static title = 'The Conservatory';
  static vantage = { position: [-3.2, 1.6, 0.95], lookAt: [1.2, 1.1, 0.25], yawLimit: 125, pitchLimit: 30, fov: 64 };
  static puzzleOrder = ['bag', 'garden'];
  /** The HUD's Back with no close-up open: out by the hall doors (see `onBack`). */
  backLabel = 'The hall';

  async build() {
    const { ctx } = this;
    this.background = new THREE.Color('#05070c');
    this.fog = new THREE.FogExp2('#0a0d12', 0.03);
    this.envIntensity = 0.35;
    this.exposure = 1.1;
    this.bloom = { strength: 0.42, threshold: 0.8, radius: 0.55 };
    this._timers = [];
    this.iron = M.iron({ color: '#22302b', roughness: 0.7 });
    this.statics = new THREE.Group(); this.statics.name = 'statics'; this.group.add(this.statics);
    this._buildShell();
    this._buildLights();
    this._buildWest();
    this._buildBench();
    this._buildFountain();
    this._buildFinch();
    this._buildBag();
    this._buildGarden();
    this._buildTallow();
    this._buildDressing();
    this.group.updateMatrixWorld(true);
    mergeStatic(this.statics);
    this._restore();
    this._carried = carriedLight(ctx, this.group);
    this._mothTarget = new THREE.Vector3();
  }

  // ───────────────────────────────────────────────── helpers
  _hs(spec) { return this.ctx.hotspots.add(spec); }
  _proxy(w, h, d, pos, parent = this.group) { const p = this.ctx.hotspots.proxyBox(w, h, d); p.position.set(...pos); parent.add(p); return p; }
  get house() { return this.ctx.house; }

  /** One glazed wall panel: iron frame, rainy night sky, optional moon and tree silhouettes. Origin bottom-centre, faces +Z. */
  _panel(w, h, { moon = null, trees = 0, seed = 1 } = {}) {
    const g = F.windowFrame({ w, h, arch: false, panes: [2, 3], frameMaterial: this.iron, sill: false, rain: 0.9, moonlight: false, skyTop: '#04060e', skyBottom: '#101a30', moon: moon || [5, 5] });
    if (trees) {
      const t = makeCanvasPlane(w, h, (c, cw, ch) => drawTrees(c, cw, ch, seed, trees), { px: 512, emissive: true, transparent: true });
      t.position.set(0, h / 2, -0.015); t.material.depthWrite = false; t.material.alphaTest = 0.05; t.userData.noRaycast = true; g.add(t);
    }
    g.userData.glass.userData.noRaycast = false;
    return g;
  }

  // ───────────────────────────────────────────────── shell: floor, plinth, ribs, glass, roof
  _buildShell() {
    const S = this.statics;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tileTexture({ a: '#4e3a30', b: '#6e5444' }), roughness: 0.6 }));
    floor.material.map.repeat.set(8, 5.6); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.keep = true; S.add(floor);
    // brick plinth on the three glass sides
    const brick = M.stone({ tint: '#5a463c', rows: 6, cols: 4, repeat: [6, 1], seed: 7 });
    const plinth = (len, x, z, ry) => { const m = F.rbox(len, PH, 0.14, brick, 0.004); m.position.set(x, PH / 2, z); m.rotation.y = ry; m.receiveShadow = true; S.add(m); const cap = F.rbox(len, 0.05, 0.2, M.smoothStone({ color: '#8a8278' }), 0.01); cap.position.set(x, PH + 0.025, z); cap.rotation.y = ry; S.add(cap); };
    plinth(W, 0, -D / 2 + 0.07, 0); plinth(W, 0, D / 2 - 0.07, Math.PI); plinth(D, W / 2 - 0.07, 0, -Math.PI / 2);
    // glazed panels between iron ribs
    const ph = EH - PH;
    const north = [-3, -1, 1, 3], pw = 1.9;
    north.forEach((x, i) => { const p = this._panel(pw, ph, { trees: i % 2 ? 2 : 1, seed: 10 + i }); p.position.set(x, PH, -D / 2 + 0.06); S.add(p); });
    north.forEach((x, i) => { const p = this._panel(pw, ph, { trees: i === 1 ? 0 : 2, seed: 20 + i }); p.position.set(x, PH, D / 2 - 0.06); p.rotation.y = Math.PI; S.add(p); });
    // east: two panels flanking the garden door; the moon sits in the north one
    const moonPanel = this._panel(2.1, ph, { moon: [0.62, 0.72], trees: 1, seed: 31 }); moonPanel.position.set(W / 2 - 0.06, PH, -1.7); moonPanel.rotation.y = -Math.PI / 2; S.add(moonPanel);
    this.moonPanel = moonPanel;
    const eastS = this._panel(2.1, ph, { trees: 2, seed: 32 }); eastS.position.set(W / 2 - 0.06, PH, 1.7); eastS.rotation.y = -Math.PI / 2; S.add(eastS);
    const transom = this._panel(1.1, EH - 2.3, { seed: 33 }); transom.position.set(W / 2 - 0.06, 2.3, 0); transom.rotation.y = -Math.PI / 2; S.add(transom);
    // ribs and the eaves beams
    const rib = (x, z) => { const m = F.rbox(0.09, EH, 0.11, this.iron, 0.01); m.position.set(x, EH / 2, z); m.castShadow = true; S.add(m); };
    for (const x of [-2, 0, 2, 4 - 0.06]) { rib(x, -D / 2 + 0.06); rib(x, D / 2 - 0.06); }
    for (const z of [-0.6, 0.6, -2.8 + 0.06, 2.8 - 0.06]) rib(W / 2 - 0.06, z);
    const beam = (len, x, z, ry) => { const m = F.rbox(len, 0.12, 0.14, this.iron, 0.01); m.position.set(x, EH + 0.06, z); m.rotation.y = ry; S.add(m); };
    beam(W, 0, -D / 2 + 0.06, 0); beam(W, 0, D / 2 - 0.06, 0); beam(D, W / 2 - 0.06, 0, Math.PI / 2);
    // the roof: two glass slopes on iron rafters, a ridge, the dark sky above
    const slopeLen = Math.hypot(D / 2, RH - EH), ang = Math.atan2(RH - EH, D / 2);
    const roofGlass = M.glass({ color: '#8fb0a8', opacity: 0.12, roughness: 0.2 });
    for (const s of [-1, 1]) {
      const slope = new THREE.Group(); slope.position.set(0, EH + (RH - EH) / 2, s * D / 4); slope.rotation.x = s * ang; S.add(slope);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, slopeLen), roofGlass); pane.rotation.x = -Math.PI / 2; pane.renderOrder = 3; pane.userData.noRaycast = true; slope.add(pane);
      for (let i = 0; i <= 8; i++) { const r = F.rbox(0.07, 0.1, slopeLen, this.iron, 0.01); r.position.set(-W / 2 + i, 0.02, 0); slope.add(r); }
      const purlin = F.rbox(W, 0.06, 0.06, this.iron, 0.01); purlin.position.set(0, 0.03, 0); slope.add(purlin);
    }
    const ridge = F.rbox(W + 0.1, 0.12, 0.14, this.iron, 0.01); ridge.position.set(0, RH, 0); S.add(ridge);
    const sky = makeCanvasPlane(14, 12, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#05070e'); gr.addColorStop(1, '#0c1222'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { px: 64, emissive: true });
    sky.rotation.x = Math.PI / 2; sky.position.set(0, RH + 0.5, 0); sky.userData.noRaycast = true; S.add(sky);
    // east gable: dark sky in a triangle above the eaves beam
    const gable = new THREE.Shape(); gable.moveTo(-D / 2, EH); gable.lineTo(D / 2, EH); gable.lineTo(0, RH); gable.closePath();
    const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), new THREE.MeshBasicMaterial({ color: '#080b16' })); gm.position.set(W / 2 - 0.04, 0, 0); gm.rotation.y = -Math.PI / 2; S.add(gm);
  }

  _buildLights() {
    const G = this.group;
    G.add(L.ambientRig({ sky: '#8fa6ff', ground: '#0e1210', hemi: 0.55, ambient: '#2a3038', ambientIntensity: 0.5 }));
    const moon = L.keyLight({ color: '#9fb6ff', intensity: 12, position: [6, 3.3, -1.4], target: [0.4, 0, 0.5], angle: 0.62, penumbra: 0.7, distance: 16, castShadow: true });
    G.add(moon); this.moonLight = moon.userData.light;
    const roofFill = new THREE.PointLight('#7f90c0', 3.5, 12, 2); roofFill.position.set(0.5, 3.1, 0); G.add(roofFill);
    const bench = new THREE.PointLight('#9fb0d8', 1.8, 6, 2); bench.position.set(0.5, 2.0, -2.0); G.add(bench);
    const doorWash = new THREE.PointLight('#9fb6ff', 2.4, 7, 2); doorWash.position.set(3.2, 2.1, 0); G.add(doorWash);
    const westWash = new THREE.PointLight('#c0a890', 1.4, 6, 2); westWash.position.set(-3.0, 2.2, -0.5); G.add(westWash);
    // the one warm thing in the room: him
    this.finchWarm = L.flickerLight({ color: '#e0a060', intensity: 1.5, distance: 4, flicker: 0.12, speed: 0.6 }); this.finchWarm.position.set(0.9, 1.1, 1.9); G.add(this.finchWarm);
  }

  // ───────────────────────────────────────────────── west: the house wall and the way back
  _buildWest() {
    const S = this.statics, { ctx } = this;
    // a pentagon wall with a door-shaped hole; local x = −world z
    const shape = new THREE.Shape();
    shape.moveTo(-D / 2, 0); shape.lineTo(D / 2, 0); shape.lineTo(D / 2, EH); shape.lineTo(0, RH); shape.lineTo(-D / 2, EH); shape.closePath();
    const hole = new THREE.Path(); const z0 = 0.2, z1 = 1.7, dh = 2.3;
    hole.moveTo(-z1, 0); hole.lineTo(-z0, 0); hole.lineTo(-z0, dh); hole.lineTo(-z1, dh); hole.closePath(); shape.holes.push(hole);
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.plaster({ tint: '#6a5a50', repeat: [2, 1.4] })); wall.position.set(-W / 2, 0, 0); wall.rotation.y = Math.PI / 2; wall.receiveShadow = true; S.add(wall);
    const wainscot = F.rbox(D, 1.0, 0.03, M.walnut({ tint: '#3a2418' }), 0.004); wainscot.position.set(-W / 2 + 0.02, 0.5, 0); wainscot.rotation.y = Math.PI / 2; S.add(wainscot);
    // the door frame and the two leaves, standing open into the conservatory
    const doors = new THREE.Group(); doors.position.set(-W / 2 + 0.03, 0, (z0 + z1) / 2); doors.rotation.y = Math.PI / 2; this.group.add(doors);
    const wood = M.walnut({ tint: '#2e1e16' }), dw = (z1 - z0) / 2;
    const fr = (w, h, x, y) => { const m = F.rbox(w, h, 0.14, wood, 0.008); m.position.set(x, y, 0); doors.add(m); };
    fr(0.1, dh + 0.1, -dw - 0.05, (dh + 0.1) / 2); fr(0.1, dh + 0.1, dw + 0.05, (dh + 0.1) / 2); fr(dw * 2 + 0.2, 0.12, 0, dh + 0.06);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * dw, 0, 0); pivot.rotation.y = s * 1.45; doors.add(pivot);
      const leaf = F.rbox(dw, dh - 0.05, 0.05, wood, 0.006); leaf.position.set(-s * dw / 2, dh / 2, 0); pivot.add(leaf);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.12, dh - 0.9), M.glass({ color: '#9fd8c8', opacity: 0.18 })); glass.position.set(-s * dw / 2, 0.78 + (dh - 0.9) / 2, 0.03); glass.renderOrder = 3; pivot.add(glass);
    }
    // the hall beyond: warm dark, a lamp somewhere
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), new THREE.MeshStandardMaterial({ color: '#1a1210', emissive: '#2a1a12', emissiveIntensity: 0.5, roughness: 1 }));
    beyond.position.set(-W / 2 - 0.6, 1.5, (z0 + z1) / 2); beyond.rotation.y = Math.PI / 2; this.group.add(beyond);
    const hall = new THREE.PointLight('#ffb070', 1.6, 4, 2); hall.position.set(-W / 2 - 0.35, 1.6, (z0 + z1) / 2); this.group.add(hall);
    // one exit: the opening and both leaves. The leaves stand into the room almost to the vantage (x = -3.2), so the proxy
    // stops at x = -3.55 (a face any closer fills half the view when looking along the wall) and the leaf group, frame and
    // glass included, is a hotspot of its own for the rest
    const back = this._proxy(0.65, dh + 0.1, z1 - z0 + 0.3, [-W / 2 + 0.125, (dh + 0.1) / 2, (z0 + z1) / 2]);
    const leave = () => this._leave();
    this._hs({ id: 'cons.back', object: back, label: 'Back to the hall', highlight: false, onClick: leave });
    this._hs({ id: 'cons.back.doors', object: doors, label: 'Back to the hall', highlight: false, onClick: leave });
  }

  // ───────────────────────────────────────────────── north: the potting bench
  _buildBench() {
    const S = this.statics, { ctx } = this;
    const bench = F.table({ w: 2.2, d: 0.62, h: 0.86, material: M.oak({ tint: '#5a4028', planks: 6 }), legs: 'square' }); bench.position.set(0.6, 0, -D / 2 + 0.5); S.add(bench);
    const top = bench.userData.topY ?? 0.86;
    const terracotta = new THREE.MeshStandardMaterial({ color: '#8a4e36', roughness: 0.95 });
    const soil = M.matte('#241a12');
    const pot = (r, h, x, z, tilt = 0) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.z = tilt; bench.add(g);
      const p = F.lathe([[r * 0.75, 0], [r * 0.78, 0.01], [r, h - 0.02], [r * 1.06, h - 0.02], [r * 1.06, h], [r * 0.92, h], [r * 0.7, 0.02], [0, 0.02]], terracotta, 18); g.add(p);
      const s = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 16), soil); s.rotation.x = -Math.PI / 2; s.position.y = h - 0.03; g.add(s);
      return g;
    };
    pot(0.07, 0.13, -0.85, 0.05); pot(0.05, 0.1, -0.66, -0.15); pot(0.09, 0.17, 0.95, -0.05, 0); pot(0.06, 0.11, 0.78, 0.18);
    const empty = F.lathe([[0.06, 0], [0.08, 0.14], [0.085, 0.15], [0.06, 0.15], [0.05, 0.01], [0, 0.01]], terracotta, 16); empty.position.set(0.3, top + 0.04, 0.12); empty.rotation.z = Math.PI / 2 - 0.2; empty.rotation.y = 0.5; bench.add(empty);
    // the dead orchid: a tall thin pot, one stem, a flower gone to paper
    const orchidPot = pot(0.06, 0.16, -0.25, -0.1);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.45, 6), M.matte('#4a3a28')); stem.position.set(0.02, 0.36, 0); stem.rotation.z = -0.25; stem.rotation.x = 0.1; orchidPot.add(stem);
    const petalMat = new THREE.MeshStandardMaterial({ color: '#b9a69a', roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), petalMat); p.scale.set(0.5, 1, 1); p.position.set(0.08 + Math.cos(i * 1.26) * 0.02, 0.55 + Math.sin(i * 1.26) * 0.02, 0); p.rotation.z = i * 1.26; p.rotation.y = 0.4; orchidPot.add(p); }
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 5), M.matte('#6a5a3a')); stake.position.set(-0.03, 0.3, 0.01); orchidPot.add(stake);
    this._hs({ id: 'cons.orchid', object: orchidPot, label: 'Dead orchid', onClick: () => ctx.dialogue.caption('caption.orchid') });
    // the watering can: galvanised, a long spout, a bail handle
    const zinc = new THREE.MeshStandardMaterial({ color: '#7a7f82', metalness: 0.7, roughness: 0.5, roughnessMap: noiseTexture({ scale: 12, seed: 61, bias: 0.8 }) });
    const can = new THREE.Group(); can.position.set(0.4, top, -0.12); can.rotation.y = -0.6; bench.add(can);
    const body = F.lathe([[0.09, 0], [0.1, 0.02], [0.1, 0.17], [0.08, 0.2], [0.05, 0.21], [0.05, 0.24], [0.06, 0.25], [0, 0.25]], zinc, 20); can.add(body);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.26, 10), zinc); spout.position.set(0.15, 0.17, 0); spout.rotation.z = -1.0; can.add(spout);
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.03, 12), zinc); rose.position.set(0.26, 0.26, 0); rose.rotation.z = -1.0; can.add(rose);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 6, 20, Math.PI), zinc); bail.position.set(0, 0.2, 0); can.add(bail);
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.007, 6, 16, Math.PI), zinc); grip.position.set(-0.1, 0.12, 0); grip.rotation.z = Math.PI / 2; can.add(grip);
    this._hs({ id: 'cons.can', object: can, label: 'Watering can', onClick: () => { ctx.dialogue.caption('caption.can'); const p = can.getWorldPosition(new THREE.Vector3()); P.burst(ctx, this.group, [p.x, p.y + 0.3, p.z], { color: '#d9d0b0', color2: '#8a8070', count: 6, radius: 0.5, duration: 2.2, size: 0.04 }); } });
    // a trowel, twine, seed packets gone soft
    const trowel = new THREE.Group(); trowel.position.set(-0.45, top + 0.01, 0.2); trowel.rotation.y = 0.9; bench.add(trowel);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), M.iron({ color: '#5a5650' })); blade.rotation.x = Math.PI / 2; blade.rotation.y = Math.PI / 4; blade.scale.y = 0.5; blade.position.set(0.1, 0.005, 0); trowel.add(blade);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.12, 8), M.oak({ tint: '#7a5a38' })); handle.rotation.z = Math.PI / 2; handle.position.set(-0.04, 0.012, 0); trowel.add(handle);
    const twine = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.018, 8, 16), M.matte('#b09a70')); twine.rotation.x = Math.PI / 2; twine.position.set(-0.95, top + 0.02, -0.18); bench.add(twine);
    for (let i = 0; i < 3; i++) { const pk = F.rbox(0.07, 0.004, 0.1, M.parchment({ tint: ['#c9b48a', '#b9a070', '#d0c0a0'][i] }), 0.001); pk.position.set(0.05 + i * 0.03, top + 0.004 * (i + 1), 0.22 - i * 0.02); pk.rotation.y = 0.2 * i; bench.add(pk); }
    // shelf under the bench with more pots
    const shelf = F.rbox(2.0, 0.025, 0.5, M.oak({ tint: '#4a3420' }), 0.004); shelf.position.set(0, 0.3, 0); bench.add(shelf);
    for (let i = 0; i < 6; i++) { const r = 0.05 + (i % 3) * 0.015; const p = F.lathe([[r * 0.75, 0], [r, 0.12], [r * 1.05, 0.13], [r * 0.9, 0.13], [0, 0.11]], terracotta, 12); p.position.set(-0.9 + i * 0.32, 0.3125, (i % 2) * 0.12 - 0.05); if (i === 4) { p.rotation.z = Math.PI / 2; p.position.y += 0.06; } bench.add(p); }
    // the thermometer, screwed to the rib at x = 0 since the glass went in
    const therm = makeCanvasPlane(0.07, 0.3, (g, w, h) => drawThermometer(g, w, h), { px: 256 });
    therm.position.set(0.0, 1.75, -D / 2 + 0.125); therm.material.roughness = 0.6; this.group.add(therm);
    const tproxy = this._proxy(0.14, 0.36, 0.06, [0, 0, 0.01], therm);
    this._hs({ id: 'cons.thermometer', object: tproxy, label: 'Thermometer', highlight: therm, onClick: () => ctx.dialogue.caption('caption.thermometer') });
    this.bench = bench;
  }

  // ───────────────────────────────────────────────── centre: the dry fountain
  _buildFountain() {
    const S = this.statics, { ctx } = this;
    const stone = M.smoothStone({ color: '#8a8278' }), dark = M.smoothStone({ color: '#4a4640', roughness: 0.95 });
    const f = new THREE.Group(); f.position.set(0.9, 0, 0.15); S.add(f);
    const basin = F.lathe([[0, 0], [0.86, 0], [0.9, 0.1], [0.9, 0.34], [0.84, 0.38], [0.74, 0.38], [0.72, 0.1], [0, 0.1]], stone, 32); basin.receiveShadow = true; f.add(basin);
    const silt = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32), dark); silt.rotation.x = -Math.PI / 2; silt.position.y = 0.105; f.add(silt);
    const ped = F.lathe([[0.18, 0.1], [0.16, 0.14], [0.1, 0.2], [0.09, 0.55], [0.14, 0.6], [0.16, 0.66], [0, 0.66]], stone, 20); f.add(ped);
    // the fish: a stone body arching up out of the pedestal, tail flared, mouth open to the sky, waiting
    const fish = new THREE.Group(); fish.position.set(0, 0.64, 0); fish.rotation.y = -0.7; f.add(fish);
    const spine = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.16), new THREE.Vector3(0, 0.14, 0.08), new THREE.Vector3(0, 0.26, -0.02), new THREE.Vector3(0, 0.34, -0.1)]);
    const bodyGeo = new THREE.TubeGeometry(spine, 16, 0.075, 12, false);
    // taper the tube: fat in the middle, narrow at the tail and the mouth
    const pos = bodyGeo.attributes.position; const pt = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { const u = Math.floor(i / 13) / 16; const k = 0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.1)); const c = spine.getPoint(Math.min(1, u)); pt.fromBufferAttribute(pos, i).sub(c).multiplyScalar(k).add(c); pt.x *= 0.8; pos.setXYZ(i, pt.x, pt.y, pt.z); }
    bodyGeo.computeVertexNormals();
    const bodyM = new THREE.Mesh(bodyGeo, stone); bodyM.castShadow = true; fish.add(bodyM);
    const tailM = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 3), stone); tailM.scale.set(0.3, 1, 1.3); tailM.position.set(0, 0.0, 0.2); tailM.rotation.x = 2.2; fish.add(tailM);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.012, 8, 16), stone); mouth.position.set(0, 0.35, -0.11); mouth.rotation.x = 0.6; fish.add(mouth);
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), M.matte('#15120f')); throat.position.set(0, 0.35, -0.11); throat.rotation.x = 0.6 - Math.PI / 2; fish.add(throat);
    for (const s2 of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), dark); eye.position.set(s2 * 0.05, 0.3, -0.07); fish.add(eye); const finS = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 3), stone); finS.scale.set(0.3, 1, 1); finS.position.set(s2 * 0.07, 0.17, 0.05); finS.rotation.z = s2 * 1.3; finS.rotation.x = 0.6; fish.add(finS); }
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 3), stone); dorsal.scale.set(0.25, 1, 1); dorsal.position.set(0, 0.26, 0.1); dorsal.rotation.x = -0.9; fish.add(dorsal);
    // dead leaves in the basin, and the coin
    const leafMat = new THREE.MeshStandardMaterial({ color: '#5a4a2a', roughness: 1, side: THREE.DoubleSide });
    const r = rng(77);
    for (let i = 0; i < 14; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.04, 7), leafMat); l.scale.set(0.6, 1, 1); l.rotation.x = -Math.PI / 2; l.rotation.z = r() * TAU; const a = r() * TAU, d = 0.2 + r() * 0.5; l.position.set(Math.cos(a) * d, 0.108 + r() * 0.004, Math.sin(a) * d); f.add(l); }
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.002, 16), M.brass({ polished: true })); coin.position.set(0.3, 0.107, -0.25); f.add(coin);
    const proxy = this._proxy(1.8, 0.5, 1.8, [0, 0.25, 0], f);
    this._hs({
      id: 'cons.fountain', object: proxy, label: 'Dry fountain', highlight: basin,
      onClick: () => {
        if (!ctx.state.get('cons.fountain.looked')) { ctx.state.set('cons.fountain.looked', true); ctx.dialogue.caption('caption.fountain'); return; }
        ctx.dialogue.caption('caption.fountain.coin');
      },
    });
    this.fountain = f;
  }

  // ───────────────────────────────────────────────── south: Mr. Finch, his chair, his table
  _buildFinch() {
    const G = this.group, S = this.statics, { ctx } = this;
    // a wicker armchair
    const wicker = new THREE.MeshStandardMaterial({ color: '#a88c5c', roughness: 0.9, bumpMap: noiseTexture({ scale: 40, seed: 71 }), bumpScale: 0.8 });
    const chair = new THREE.Group(); chair.position.set(...CHAIR.pos); chair.rotation.y = CHAIR.yaw; S.add(chair);
    const seat = F.rbox(0.64, 0.1, 0.58, wicker, 0.02); seat.position.set(0, 0.4, 0); chair.add(seat);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.75, 24, 1, true, Math.PI / 2, Math.PI), wicker); back.material.side = THREE.DoubleSide; back.position.set(0, 0.72, -0.12); chair.add(back);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), wicker); arm.rotation.x = Math.PI / 2; arm.position.set(s * 0.33, 0.62, 0.05); chair.add(arm); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), wicker); post.position.set(s * 0.33, 0.51, 0.28); chair.add(post); }
    for (const [x, z] of [[-0.28, 0.25], [0.28, 0.25], [-0.28, -0.25], [0.28, -0.25]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.36, 8), wicker); leg.position.set(x, 0.18, z); chair.add(leg); }
    const cushion = F.rbox(0.56, 0.06, 0.5, M.velvet({ color: '#4a3a2a' }), 0.02); cushion.position.set(0, 0.47, 0.02); chair.add(cushion);
    this.chair = chair;
    // the man himself, seated; and the same man on his feet, for later
    const seated = makeFigure({ kind: 'finch' }); seated.position.set(...CHAIR.pos); seated.rotation.y = CHAIR.yaw; seated.translateZ(0.27); G.add(seated);
    const standing = makeFigure({ kind: 'finch', pose: 'standing' }); standing.position.copy(seated.position); standing.rotation.y = CHAIR.yaw; standing.translateZ(0.3); standing.visible = false; G.add(standing);
    this.finch = seated; this.finchUp = standing;
    // the badge face, readable up close
    const badge = seated.userData.badge;
    const face = makeCanvasPlane(0.06, 0.06, (g, w, h) => drawBadge(g, w, h), { px: 256, transparent: true });
    face.material.roughness = 0.3; face.material.metalness = 0.6; face.material.emissive = new THREE.Color('#c09a5a'); face.material.emissiveMap = face.material.map; face.material.emissiveIntensity = 0.75; // lit by its own texture, so the struck number keeps its contrast in the dark
    face.position.copy(badge.position); face.position.z += 0.0035; badge.parent.add(face);
    this.badge = face;
    this._hs({
      id: 'cons.finch', object: seated, label: 'Mr. Finch',
      onClick: () => (this._wantsToAsk() ? this._lanternChoice() : ctx.hints.ask()),
      useItem: { lantern: () => this._lanternChoice(), bonekey: () => ctx.dialogue.say([{ who: 'finch', text: 'Put that away. I know what it costs.' }]), '*': () => ctx.dialogue.caption('caption.nope') },
    });
    // the proxy covers his chest and up to the collar (playtest: the old one was small and low): from the doorway the
    // badge itself is a few pixels wide
    const bproxy = this._proxy(0.3, 0.32, 0.08, [0, 0.08, 0.02], face);
    this._hs({
      id: 'cons.badge', object: bproxy, label: 'His badge', highlight: face,
      useItem: { lantern: () => this._lanternChoice(), bonekey: () => ctx.dialogue.say([{ who: 'finch', text: 'Put that away. I know what it costs.' }]), '*': () => ctx.dialogue.caption('caption.nope') },
      onClick: async () => {
        const p = face.getWorldPosition(new THREE.Vector3()); const n = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
        // the badge sits in the upper half of the screen, above the dialogue box that says the line (centred, the box
        // covered the number), big enough that 417 reads at a glance
        const cam = p.clone().addScaledVector(n, 0.34);
        const look = p.clone(); look.y -= 0.024;
        await ctx.camera.focus({ position: cam, lookAt: look, scope: 'focus:cons.badge', fov: 28, onExit: () => ctx.dialogue.hideCaption() });
        if (ctx.camera.inFocus && ctx.camera.scope === 'focus:cons.badge') ctx.dialogue.say('react.finch.badge'); // not after Back
      },
    });
    // the side table, the cold cup, and the place the lantern goes
    // at his left hand on the room side of the chair, so the lantern left with him shows from the doorway (behind the
    // chair it was hidden by him); in the room group, not statics, so the lantern on it stays a separate, lit prop
    const table = new THREE.Group(); table.position.set(-0.05, 0, 1.3); G.add(table);
    const ttop = F.lathe([[0, 0.58], [0.26, 0.58], [0.27, 0.6], [0.25, 0.62], [0, 0.62]], M.walnut({ tint: '#3a2418' }), 24); table.add(ttop);
    const post = F.lathe([[0.16, 0], [0.16, 0.02], [0.04, 0.05], [0.03, 0.45], [0.06, 0.55], [0.08, 0.58]], M.walnut({ tint: '#2e1e16' }), 14); table.add(post);
    const cup = new THREE.Group(); cup.position.set(-0.1, 0.62, 0.06); table.add(cup);
    const china = new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.35 });
    const saucer = F.lathe([[0, 0], [0.06, 0], [0.065, 0.008], [0, 0.008]], china, 20); cup.add(saucer);
    const cupM = F.lathe([[0.025, 0.008], [0.03, 0.02], [0.038, 0.07], [0.04, 0.075], [0.035, 0.075], [0.03, 0.03], [0, 0.03]], china, 18); cup.add(cupM);
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.2 })); tea.rotation.x = -Math.PI / 2; tea.position.y = 0.07; cup.add(tea);
    const hndl = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 12, Math.PI), china); hndl.position.set(0.04, 0.045, 0); hndl.rotation.z = -Math.PI / 2; cup.add(hndl);
    this._hs({ id: 'cons.cup', object: cup, label: 'A cup of tea', onClick: () => ctx.dialogue.caption('caption.cup') });
    const lantern = lanternProp(); lantern.position.set(0.08, 0.62, -0.04); lantern.visible = false; table.add(lantern);
    this.tableLantern = lantern;
    // moths: a loose cloud that drifts to whatever is warm
    const moths = P.dustMotes({ box: [1.3, 1.2, 1.1], center: [0, 0, 0], count: 70, color: '#d9d0b0', size: 0.034, opacity: 0.6 });
    moths.position.set(CHAIR.pos[0], 1.05, CHAIR.pos[2]); G.add(moths);
    this.moths = moths;
  }

  /** He asks for the lantern himself, once, whatever verb opened his bag or the door: on a click while it is carried, and
   *  at the latest when the garden door opens and he stands. */
  _wantsToAsk() { return this.house.lantern === 'carried' && !this.house.finchOut && !this.ctx.state.get('cons.finch.asked'); }
  async _lanternChoice() {
    const { ctx } = this;
    if (this.house.lantern !== 'carried' || this.house.finchOut) return;
    ctx.state.set('cons.finch.asked', true);
    (this.finch.visible ? this.finch : this.finchUp).userData.lookAt(ctx.camera.camera.position.clone(), 6);
    const idx = await ctx.dialogue.choice('choice.finch.lantern');
    if (idx !== 0) return;
    if (!this.house.giveLantern('finch')) return;
    ctx.inventory.remove('lantern');
    ctx.audio.play('drop', { gain: 0.6 });
    this.tableLantern.visible = true;
    this._carried.set(false);
    ctx.state.set('hint.garden.level', 3); // he has said it outright
    await ctx.dialogue.say('react.finch.lantern.given');
  }

  // ───────────────────────────────────────────────── the bag on its hook
  _buildBag() {
    const G = this.group, S = this.statics, { ctx } = this;
    // a hook on the rib at x = 0, south wall
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14, Math.PI * 1.3), M.brass()); hook.position.set(0, 1.56, D / 2 - 0.13); hook.rotation.y = Math.PI / 2; hook.rotation.z = -0.4; S.add(hook);
    const bag = new THREE.Group(); bag.position.set(0, 1.0, D / 2 - 0.25); bag.rotation.y = Math.PI; G.add(bag);
    const canvas = new THREE.MeshStandardMaterial({ color: '#6a6248', roughness: 1, bumpMap: noiseTexture({ scale: 30, seed: 81 }), bumpScale: 0.4 });
    const leather = new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.6 });
    const body = F.rbox(0.46, 0.32, 0.2, canvas, 0.03); body.position.y = 0.16; body.castShadow = true; bag.add(body);
    const bottom = F.rbox(0.47, 0.05, 0.21, leather, 0.01); bottom.position.y = 0.025; bag.add(bottom);
    // the carry handles arch over the top; once the bag is open they fall to the sides, out of the way of what is inside
    const handles = [-1, 1].map((s) => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 18, Math.PI), leather); h.position.set(s * 0.06, 0.32, 0); h.rotation.order = 'ZYX'; h.rotation.y = Math.PI / 2; h.userData.side = s; bag.add(h); return h; });
    const dropHandles = (animated) => handles.forEach((h) => {
      const to = { x: h.userData.side * 0.2 }, rz = -h.userData.side * 1.9;
      if (!animated) { h.position.x = to.x; h.rotation.z = rz; return; }
      ctx.tween.to(h.position, to, { duration: 0.5, ease: 'outCubic' }); ctx.tween.to(h.rotation, { z: rz }, { duration: 0.5, ease: 'outCubic' });
    });
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), leather); strap.position.set(0, 0.48, 0); bag.add(strap);
    const flapPivot = new THREE.Group(); flapPivot.position.set(0, 0.32, -0.1); bag.add(flapPivot);
    const flap = F.rbox(0.46, 0.02, 0.24, canvas, 0.008); flap.position.set(0, 0, 0.12); flapPivot.add(flap);
    const lip = F.rbox(0.46, 0.1, 0.02, canvas, 0.008); lip.position.set(0, -0.05, 0.23); flapPivot.add(lip);
    const tag = makeCanvasPlane(0.08, 0.04, (g, w, h) => { g.fillStyle = '#5a3a22'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9c8a0'; g.font = `700 ${h * 0.5}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A. FINCH', w / 2, h / 2); }, { px: 128 });
    tag.position.set(0.14, 0.2, 0.105); bag.add(tag);
    // the number lock: a brass plate on the lip with three digit windows
    const plate = F.rbox(0.12, 0.05, 0.012, M.brass(), 0.003); plate.position.set(0, -0.06, 0.245); flapPivot.add(plate);
    const vals = ctx.state.get('cons.bag.dials', [0, 0, 0]);
    const dials = vals.map((v, i) => {
      const d = makeCanvasPlane(0.026, 0.034, (g, w, h) => drawDigit(g, w, h, v), { px: 96, emissive: true });
      d.material.color.setScalar(0.9); d.position.set(-0.034 + i * 0.034, -0.06, 0.252); d.userData.value = v; flapPivot.add(d);
      return d;
    });
    this.bagDials = dials;
    // inside: the wrench and the matchbox, poking up once the flap is open
    const wrench = new THREE.Group(); wrench.position.set(-0.15, 0.345, 0.0); wrench.rotation.z = 0.12; wrench.visible = false; bag.add(wrench);
    this._proxy(0.16, 0.1, 0.12, [0, 0.01, 0], wrench);
    const wrenchM = M.iron({ color: '#8f949a', roughness: 0.4 }).clone(); wrenchM.emissive.set('#3a3e44'); // lifted a little: it reads as a hole otherwise
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, 0.012), wrenchM); wrench.add(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.012), wrenchM); w2.position.set(0.052, 0.015, 0); wrench.add(w2);
    const matchbox = F.rbox(0.055, 0.018, 0.038, M.parchment({ tint: '#d8c090' }), 0.002); matchbox.position.set(0.14, 0.335, 0.0); matchbox.rotation.y = 0.3; matchbox.visible = false; bag.add(matchbox);
    this._proxy(0.12, 0.08, 0.1, [0, 0.01, 0], matchbox);
    const stripe = F.rbox(0.056, 0.004, 0.039, M.matte('#2a2a2a'), 0.001); stripe.position.y = -0.006; matchbox.add(stripe);
    this.bag = { group: bag, flapPivot, wrench, matchbox, dials, dropHandles };
    // closed: look at the lock on the front; open: look down into it
    const pose = () => (this.house.isOpen('bag')
      ? { position: [0.0, 1.86, D / 2 - 0.5], lookAt: [0, 1.31, D / 2 - 0.24], fov: 38 } // steeply down onto the top, the flap behind
      : { position: [0.05, 1.3, D / 2 - 0.95], lookAt: [0, 1.2, D / 2 - 0.25], fov: 40 }); // the dials just above centre, clear of the HUD's Back
    const onOpen = async (verb) => {
      ctx.audio.play('unlock', { gain: 0.6, pitch: 1.3 });
      await ctx.tween.delay(0.25);
      ctx.audio.play('paperRustle', { gain: 0.5 });
      dropHandles(true);
      await ctx.tween.to(flapPivot.rotation, { x: -1.9 }, { duration: 0.8, ease: 'outBack' });
      wrench.visible = !this.house.wrench; matchbox.visible = true;
      if (ctx.camera.inFocus && ctx.camera.scope === 'focus:cons.bag') await ctx.camera.refocus(pose());
      void verb;
    };
    const force = () => this.house.open('bag', 'force', { onOpen, stay: true });
    const focus = () => ctx.camera.focus({ ...pose(), scope: 'focus:cons.bag', onExit: () => this.house.blurLock() })
      .then(() => { if (ctx.camera.inFocus && ctx.camera.scope === 'focus:cons.bag') this.house.focusLock('bag', { onOpen, stay: true }); });
    const bagHs = {
      label: () => (this.house.isOpen('bag') ? "Finch's bag" : "Finch's bag, locked"),
      onClick: () => focus(),
      useItem: { bonekey: () => { if (!this.house.isOpen('bag')) force(); } },
    };
    this._hs({ id: 'cons.bag', object: body, ...bagHs });
    // shut, the flap, its lip, the lock plate and the handles sit over the top half of the body: one box for the whole
    // bag, handles and strap included. Open, it steps aside so the wrench and matchbox inside can be clicked from the room
    const wholeBag = this._proxy(0.52, 0.64, 0.36, [0, 0.29, 0.05], bag);
    this._hs({ id: 'cons.bag.whole', object: wholeBag, highlight: body, enabled: () => !this.house.isOpen('bag'), ...bagHs });
    dials.forEach((d, i) => {
      const proxy = ctx.hotspots.proxyBox(0.034, 0.045, 0.02); proxy.position.copy(d.position); flapPivot.add(proxy);
      this._hs({
        id: `cons.bag.dial${i}`, object: proxy, label: 'Number dial', scope: 'focus:cons.bag', highlight: d,
        enabled: () => !this.house.isOpen('bag'),
        onClick: () => {
          d.userData.value = (d.userData.value + 1) % 10;
          ctx.audio.play('ratchet', { gain: 0.45, pitch: 1.3 + i * 0.1 });
          d.userData.redraw((g, w, h) => drawDigit(g, w, h, d.userData.value));
          ctx.state.set('cons.bag.dials', dials.map((x) => x.userData.value));
          if (dials.every((x, j) => x.userData.value === BAG_SOLUTION[j])) this.house.open('bag', 'pick', { onOpen, stay: true });
        },
        useItem: { bonekey: force },
      });
    });
    this._hs({
      id: 'cons.wrench', object: wrench, label: 'Tension wrench', scope: ['focus:cons.bag', 'room'],
      enabled: () => this.house.isOpen('bag') && !this.house.wrench,
      onClick: async () => { this.house.takeWrench(); ctx.inventory.add('wrench', { from: wrench }); wrench.visible = false; await ctx.dialogue.say('react.wrench.found'); },
    });
    this._hs({ id: 'cons.matchbox', object: matchbox, label: 'Matchbox', scope: ['focus:cons.bag', 'room'], enabled: () => this.house.isOpen('bag'), onClick: () => ctx.dialogue.say('react.matchbox') });
  }

  // ───────────────────────────────────────────────── east: the garden door and its pins
  _buildGarden() {
    const G = this.group, S = this.statics, { ctx } = this;
    const door = new THREE.Group(); door.position.set(W / 2 - 0.08, 0, 0); door.rotation.y = -Math.PI / 2; G.add(door);
    const dw = 1.0, dh = 2.2;
    const post = (x) => { const m = F.rbox(0.1, dh + 0.1, 0.14, this.iron, 0.01); m.position.set(x, (dh + 0.1) / 2, 0); door.add(m); };
    post(-dw / 2 - 0.05); post(dw / 2 + 0.05);
    const head = F.rbox(dw + 0.2, 0.1, 0.14, this.iron, 0.01); head.position.set(0, dh + 0.05, 0); door.add(head);
    const step = F.rbox(dw + 0.3, 0.04, 0.4, M.smoothStone({ color: '#7a7268' }), 0.01); step.position.set(0, 0.02, -0.1); door.add(step);
    // the garden beyond: a path, dead trees, a gate, rain
    const garden = makeCanvasPlane(2.2, 2.8, (g, w, h) => drawGarden(g, w, h), { px: 512, emissive: true });
    garden.position.set(0, 1.3, -0.75); garden.material.color.setScalar(0.9); door.add(garden);
    const beyondLight = new THREE.PointLight('#9fb6ff', 0, 4, 2); beyondLight.position.set(0, 1.4, -0.5); door.add(beyondLight);
    // the leaf, hinged on the south post, opening outward
    const pivot = new THREE.Group(); pivot.position.set(dw / 2, 0, 0); door.add(pivot);
    const leaf = new THREE.Group(); leaf.position.set(-dw / 2, 0, 0); pivot.add(leaf);
    const stile = (x) => { const m = F.rbox(0.07, dh, 0.05, this.iron, 0.006); m.position.set(x, dh / 2, 0); leaf.add(m); };
    stile(-dw / 2 + 0.035); stile(dw / 2 - 0.035);
    const rail = (y, h) => { const m = F.rbox(dw - 0.1, h, 0.05, this.iron, 0.006); m.position.set(0, y, 0); leaf.add(m); };
    rail(0.1, 0.2); rail(dh - 0.04, 0.08); rail(0.9, 0.06);
    const lowerPanel = F.rbox(dw - 0.14, 0.68, 0.03, this.iron, 0.006); lowerPanel.position.set(0, 0.53, 0); leaf.add(lowerPanel);
    const glassMat = M.glass({ color: '#9fd8c8', opacity: 0.16, roughness: 0.2 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.14, dh - 1.0), glassMat); glass.position.set(0, 0.93 + (dh - 1.0) / 2, 0); glass.renderOrder = 3; leaf.add(glass);
    for (let i = 1; i < 3; i++) { const m = F.rbox(dw - 0.1, 0.025, 0.04, this.iron, 0.004); m.position.set(0, 0.93 + i * ((dh - 1.0) / 3), 0); leaf.add(m); }
    const mull = F.rbox(0.025, dh - 1.0, 0.04, this.iron, 0.004); mull.position.set(0, 0.93 + (dh - 1.0) / 2, 0); leaf.add(mull);
    // the lock: a brass escutcheon at hand height on the free stile
    const LX = -dw / 2 + 0.035, LY = 1.0;
    const esc = F.rbox(0.07, 0.15, 0.012, M.brass(), 0.004); esc.position.set(LX, LY, 0.035); leaf.add(esc);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 20), M.brass({ polished: true })); cyl.rotation.x = Math.PI / 2; cyl.position.set(LX, LY + 0.03, 0.045); leaf.add(cyl);
    const keyway = F.rbox(0.004, 0.02, 0.006, M.matte('#060402'), 0.001); keyway.position.set(LX, LY + 0.03, 0.05); leaf.add(keyway);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), M.brass()); knob.position.set(LX, LY - 0.04, 0.05); leaf.add(knob);
    // the cutaway: what the wrench shows you. Hidden until picking begins. A bronze cross-section, five pin stacks.
    const cut = new THREE.Group(); cut.position.set(LX + 0.17, LY + 0.03, 0.05); cut.visible = false; leaf.add(cut);
    const housing = F.rbox(0.26, 0.13, 0.03, new THREE.MeshStandardMaterial({ color: '#6a5232', roughness: 0.5, metalness: 0.4 }), 0.006); housing.position.set(0, 0, -0.012); cut.add(housing);
    const bore = F.rbox(0.24, 0.028, 0.02, M.matte('#15110c'), 0.002); bore.position.set(0, -0.034, 0.0); cut.add(bore);
    const shear = F.rbox(0.24, 0.002, 0.024, new THREE.MeshBasicMaterial({ color: '#9fe0c0' }), 0.0005); shear.position.set(0, -0.02, 0.0); cut.add(shear);
    const keyPinM = new THREE.MeshStandardMaterial({ color: '#d9b25a', emissive: '#6a4a10', emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.7 });
    const driverM = new THREE.MeshStandardMaterial({ color: '#c0c6cc', emissive: '#30363c', emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.8 });
    const cutLight = new THREE.PointLight('#ffe0b0', 0.05, 0.6, 2); cutLight.position.set(0, 0.03, 0.16); cut.add(cutLight);
    const pins = [];
    for (let i = 0; i < 5; i++) {
      const x = -0.088 + i * 0.044;
      const chan = F.rbox(0.02, 0.1, 0.014, M.matte('#1a1510'), 0.002); chan.position.set(x, 0.01, 0.004); cut.add(chan);
      const stack = new THREE.Group(); stack.position.set(x, 0, 0.012); cut.add(stack);
      const kh = 0.03 + i * 0.003;
      const key = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0055, kh, 12), keyPinM); key.position.y = -0.048 + kh / 2; stack.add(key);
      const drv = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.026, 12), driverM); drv.position.y = -0.048 + kh + 0.013; stack.add(drv);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6, 6), M.iron({ color: '#8a8a8a' })); spring.position.y = drv.position.y + 0.013 + 0.015; stack.add(spring);
      pins.push({ stack, key, drv, spring, set: false, lift: 0.02 - (kh - 0.03) });
      const proxy = ctx.hotspots.proxyBox(0.04, 0.12, 0.04); proxy.position.set(x, 0, 0.012); cut.add(proxy);
      this._hs({
        id: `cons.garden.pin${i}`, object: proxy, label: `Pin ${i + 1}`, scope: 'focus:cons.garden', highlight: key,
        enabled: () => this._picking && !this.house.isOpen('garden'),
        onClick: () => this._pressPin(i),
      });
    }
    const wrenchIn = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.08), M.iron({ color: '#8f949a', roughness: 0.4 })); wrenchIn.position.set(LX, LY + 0.026, 0.08); wrenchIn.rotation.z = 0.5; wrenchIn.visible = false; leaf.add(wrenchIn);
    this.garden = { door, pivot, leaf, cut, pins, wrenchIn, beyondLight, esc };
    this._picking = false;
    const onOpen = async () => {
      this._picking = false; cut.visible = false; wrenchIn.visible = false;
      ctx.audio.play('unlock', { gain: 0.8 });
      await ctx.tween.delay(0.3);
      ctx.audio.play('doorOpen', { gain: 0.7, pitch: 0.8 });
      ctx.audio.play('gust', { gain: 0.5 });
      ctx.tween.to(beyondLight, { intensity: 2.2 }, { duration: 1.4 });
      await ctx.tween.to(pivot.rotation, { y: -1.5 }, { duration: 1.4, ease: 'outCubic' });
    };
    const after = (verb) => this._afterGarden(verb);
    this._gardenOpen = { onOpen, after };
    const force = () => this.house.open('garden', 'force', { onOpen, after });
    const lockW = () => leaf.localToWorld(new THREE.Vector3(LX + 0.09, LY + 0.02, 0.05));
    const focus = async () => {
      const l = lockW();
      await ctx.camera.focus({ position: [l.x - 0.66, l.y + 0.04, l.z + 0.03], lookAt: [l.x, l.y, l.z], scope: 'focus:cons.garden', fov: 38, onExit: () => { this.house.blurLock(); this._endPicking(); } });
      if (ctx.camera.inFocus && ctx.camera.scope === 'focus:cons.garden') this.house.focusLock('garden', { onOpen, after });
    };
    const startPicking = async () => {
      if (this.house.isOpen('garden')) return;
      if (!this.house.wrench) { ctx.audio.play('error', { gain: 0.4 }); return ctx.dialogue.say('react.garden.nowrench'); }
      if (!ctx.camera.inFocus || ctx.camera.scope !== 'focus:cons.garden') await focus();
      if (this._picking || !ctx.camera.inFocus || ctx.camera.scope !== 'focus:cons.garden') return;
      this._picking = true;
      ctx.audio.play('keyTurn', { gain: 0.5, pitch: 1.3 });
      wrenchIn.visible = true;
      cut.visible = true; cut.scale.set(0.01, 0.01, 0.01);
      await ctx.tween.to(cut.scale, { x: 1, y: 1, z: 1 }, { duration: 0.35, ease: 'outBack' });
    };
    this._startPicking = startPicking;
    this._hs({
      id: 'cons.garden', object: leaf, label: () => (this.house.isOpen('garden') ? 'Into the garden' : 'Garden door'),
      onClick: () => (this.house.isOpen('garden') ? this._walkOut() : focus()),
      useItem: { bonekey: () => { if (!this.house.isOpen('garden')) force(); }, wrench: startPicking, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    // once the leaf stands open the whole doorway is the way out: one box from just inside the frame (in front of the
    // plinth, the step and the posts, which would otherwise eat the clicks) out past the swung leaf
    const wayProxy = ctx.hotspots.proxyBox(dw + 0.4, dh + 0.25, 1.4); wayProxy.position.set(0, (dh + 0.25) / 2, -0.45); door.add(wayProxy);
    this._hs({ id: 'cons.garden.way', object: wayProxy, label: 'Into the garden', highlight: false, enabled: () => this.house.isOpen('garden'), onClick: () => this._walkOut() });
    const lockProxy = ctx.hotspots.proxyBox(0.12, 0.2, 0.08); lockProxy.position.set(LX, LY, 0.05); leaf.add(lockProxy);
    this._hs({
      id: 'cons.garden.lock', object: lockProxy, label: 'Pin lock', scope: ['focus:cons.garden', 'room'], highlight: esc,
      enabled: () => !this.house.isOpen('garden') && !this._picking,
      onClick: () => startPicking(),
      useItem: { wrench: startPicking, bonekey: force },
    });
  }

  _pressPin(i) {
    const { ctx } = this;
    const pins = this.garden.pins;
    const setCount = pins.filter((p) => p.set).length;
    const expected = PIN_ORDER[setCount];
    const lift = (p, up, dur = 0.18) => ctx.tween.to(p.stack.position, { y: up ? p.lift : 0 }, { duration: dur, ease: up ? 'outBack' : 'inQuad' });
    if (pins[i].set) { ctx.audio.play('click', { gain: 0.3 }); return; }
    if (i === expected) {
      pins[i].set = true;
      ctx.audio.play('ratchet', { gain: 0.5, pitch: 1.6 + setCount * 0.1 });
      lift(pins[i], true);
      if (pins.every((p) => p.set)) {
        this.house.open('garden', 'pick', this._gardenOpen);
      }
      return;
    }
    // wrong one: they all let go, and the caption says how far you got
    ctx.audio.play('drop', { gain: 0.5, pitch: 1.4 });
    ctx.camera.shake(0.004, 0.2);
    for (const p of pins) { p.set = false; lift(p, false, 0.12); }
    // a few ways of saying each count, never the same one twice running
    const pool = [].concat(ctx.script[`react.garden.drop.${setCount}`] || []);
    this._dropLast ||= {};
    let k = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && k === this._dropLast[setCount]) k = (k + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
    this._dropLast[setCount] = k;
    if (pool.length) ctx.dialogue.caption(pool[k], { duration: 3.5 });
  }
  _endPicking() {
    if (!this._picking) return;
    this._picking = false;
    const g = this.garden;
    g.cut.visible = false; g.wrenchIn.visible = false;
    for (const p of g.pins) { p.set = false; p.stack.position.y = 0; }
  }

  /** After the garden door opens, by any verb: Finch stands, and asks. */
  async _afterGarden(verb) {
    const { ctx } = this;
    if (this.house.finch === 'garden' || this._stood) return;
    this._stood = true;
    ctx.hotspots.lock();
    try {
      ctx.camera.lookAtPoint(this.finch.position.clone().setY(1.0));
      await ctx.tween.delay(0.6);
      ctx.audio.play('bookSlide', { gain: 0.4, pitch: 0.6 });
      const chest = this.finch.position.clone().setY(0.9);
      P.burst(ctx, this.group, chest.toArray(), { color: '#d9d0b0', color2: '#8a8070', count: 30, radius: 1.0, duration: 2.5, size: 0.04 });
      this.finch.visible = false; this.finchUp.visible = true;
      this.finchUp.userData.lookAt(ctx.camera.camera.position.clone(), 6);
      if (this._wantsToAsk()) await this._lanternChoice(); // he was never asked for it, or never asked: before he goes
      const idx = await ctx.dialogue.choice('choice.finch.out');
      if (idx === 0) {
        this.house.letFinchOut();
        const out = this.finchUp.userData.walkTo;
        await out(ctx, [3.0, 0, 0.3], { speed: 0.7 });
        await out(ctx, [5.4, 0, -0.1], { speed: 0.75 });
        this.finchUp.visible = false;
        this.moths.userData.setOpacity(0.25);
        await ctx.dialogue.say('react.finch.out');
      } else {
        await ctx.tween.delay(0.3);
        this.finchUp.visible = false; this.finch.visible = true;
        await ctx.dialogue.say('react.finch.stays');
      }
      if (this.tallow.visible) { this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 5); await ctx.dialogue.say('react.tallow.finch'); }
    } finally { ctx.hotspots.unlock(); }
    void verb;
  }

  /** Back through the hall doors (the doors' hotspots, and the HUD's Back / Esc with no close-up open). */
  _leave() {
    if (this._leaving) return;
    this._leaving = true;
    Promise.resolve(this.ctx.game.goToRoom('foyer')).finally(() => { this._leaving = false; });
  }
  onBack() {
    const { ctx } = this;
    if (ctx.camera.inFocus || ctx.dialogue.isOpen || ctx.dialogue.busy || this._leaving) return false;
    this._leave();
    return true;
  }

  /** Out through the garden door: round the house, in the wet, and back in at the foyer. The hall says the line. */
  async _walkOut() {
    const { ctx } = this;
    if (this._leaving) return;
    this._leaving = true;
    ctx.hotspots.lock();
    try {
      ctx.audio.play('footstep', { gain: 0.4, pitch: 0.8 });
      const l = this.garden.door.localToWorld(new THREE.Vector3(0, 1.5, -0.2));
      ctx.camera.lookAtPoint(l);
      await ctx.tween.delay(0.4);
      ctx.audio.play('gust', { gain: 0.6, pitch: 0.8 });
      await ctx.transitions.fadeOut(1.6);
      ctx.memorial.visit('garden');
      await ctx.tween.delay(0.4);
      await ctx.dialogue.say('react.sidedoor'); // over black (the dialogue layer sits above the fade); the hall arrives after
    } finally { ctx.hotspots.unlock(); }
    await ctx.game.goToRoom('foyer', { fade: false, duration: 1.2 });
  }

  // ───────────────────────────────────────────────── Mrs. Tallow, if she is sent for
  _buildTallow() {
    const { ctx } = this;
    const fig = makeFigure({ kind: 'tallow' });
    fig.position.set(-3.0, 0, 1.95); fig.rotation.y = Math.PI / 2; fig.visible = false; this.group.add(fig);
    this.tallow = fig;
    this._hs({
      id: 'cons.tallow', object: fig, label: 'Mrs. Tallow', enabled: () => fig.visible,
      onClick: () => { fig.userData.lookAt(ctx.camera.camera.position.clone(), 4); ctx.dialogue.say([{ who: 'tallow', text: 'Mr. Finch is the one to ask in here. He has had the time to think.' }]); },
      useItem: { '*': () => ctx.dialogue.caption('caption.nope') },
    });
  }
  async tallowTo(lockId) {
    const spots = { bag: { pos: [-0.75, 0, 2.05], yaw: 0.9 }, garden: { pos: [2.75, 0, 1.35], yaw: 2.2 } }; // garden: off to the side, not in the doorway
    const s = spots[lockId]; if (!s) return;
    if (!this.tallow.visible) { this.tallow.position.set(-3.0, 0, 1.95); this.tallow.rotation.y = Math.PI / 2; this.tallow.visible = true; this.ctx.state.set('cons.tallow.here', true); }
    await this.tallow.userData.walkTo(this.ctx, s.pos, { faceYaw: s.yaw, speed: 1.35 });
  }
  /** Is she already standing in here (for the ring line: "again", not "on my way")? */
  tallowHere() { return this.tallow.visible; }
  /** The house calls while the player is in here: she comes in at the hall doors and stands by them. */
  async onCall() {
    const { ctx } = this;
    const fig = this.tallow;
    if (!fig.visible) { fig.position.set(-3.0, 0, 1.95); fig.rotation.y = Math.PI / 2; fig.visible = true; }
    ctx.state.set('cons.tallow.here', true);
    await fig.userData.walkTo(ctx, [-2.4, 0, 2.1], { faceYaw: Math.PI / 2 - 0.6, speed: 1.2 });
    fig.userData.lookAt(ctx.camera.camera.position.clone(), 5);
  }
  onHintAsked() {
    const cam = this.ctx.camera.camera.position.clone();
    (this.finch.visible ? this.finch : this.finchUp).userData.lookAt(cam, 5);
  }

  // ───────────────────────────────────────────────── dressing: vines, leaves, webs
  _buildDressing() {
    const S = this.statics;
    const vine = new THREE.MeshStandardMaterial({ color: '#2e2418', roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4a3e22', roughness: 1, side: THREE.DoubleSide });
    const r = rng(91);
    const climb = (x, z, h, lean) => {
      const pts = []; for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(x + Math.sin(i * 1.7) * 0.06 + lean[0] * i / 8, (h * i) / 8, z + Math.cos(i * 1.3) * 0.06 + lean[1] * i / 8));
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 6, false), vine); S.add(m);
      for (let i = 0; i < 10; i++) { const p = pts[Math.floor(r() * pts.length)]; const l = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6), leafMat); l.scale.set(0.6, 1, 1); l.position.set(p.x + (r() - 0.5) * 0.1, p.y + (r() - 0.5) * 0.3, p.z + (r() - 0.5) * 0.1); l.rotation.set(r() * 3, r() * 3, r() * 3); S.add(l); }
    };
    climb(-2 + 0.08, -D / 2 + 0.14, EH, [0.1, 0]); climb(2 - 0.08, -D / 2 + 0.14, EH - 0.3, [-0.1, 0]); climb(-2 + 0.08, D / 2 - 0.14, EH, [0.05, 0]); climb(W / 2 - 0.14, -0.6 - 0.08, EH, [0, 0.1]);
    // leaves on the floor, blown toward the hall doors
    for (let i = 0; i < 50; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6), leafMat); l.scale.set(0.6, 1, 1); l.rotation.x = -Math.PI / 2; l.rotation.z = r() * TAU; l.position.set(-3.6 + r() * 7, 0.004, -2.4 + r() * 4.8); S.add(l); }
    for (const [x, z, ry] of [[-W / 2 + 0.02, -D / 2 + 0.02, 0], [W / 2 - 0.1, D / 2 - 0.1, -Math.PI / 2]]) { const web = cobweb({ size: 0.8 }); web.position.set(x, EH - 0.05, z); web.rotation.y = ry; this.group.add(web); }
    this.group.add(P.dustMotes({ box: [7, 2.8, 5], center: [0, 1.6, 0], count: 200, color: '#c8d0e0', size: 0.014, opacity: 0.35 }));
    const moonProxy = this._proxy(2.0, 2.0, 0.1, [0, 1.0, 0], this.moonPanel);
    this._hs({ id: 'cons.moon', object: moonProxy, label: 'The moon', highlight: false, onClick: () => this._cloud() });
  }
  _cloud() {
    const { ctx } = this;
    if (this._clouding) return;
    this._clouding = true;
    ctx.dialogue.caption('caption.moon');
    const l = this.moonLight, base = l.intensity;
    ctx.tween.to(l, { intensity: base * 0.3 }, { duration: 1.6, ease: 'inOutSine' }).then(() => ctx.tween.to(l, { intensity: base }, { duration: 2.4, ease: 'inOutSine', delay: 1.0 })).then(() => { this._clouding = false; });
  }

  // ───────────────────────────────────────────────── restore / lifecycle
  _restore() {
    const h = this.house;
    if (h.isOpen('bag')) { this.bag.flapPivot.rotation.x = -1.9; this.bag.dropHandles(false); this.bag.matchbox.visible = true; this.bag.wrench.visible = !h.wrench; this.bag.dials.forEach((d, i) => { d.userData.value = BAG_SOLUTION[i]; d.userData.redraw((g, w, hh) => drawDigit(g, w, hh, BAG_SOLUTION[i])); }); }
    if (h.lanternWith === 'finch') this.tableLantern.visible = true;
    if (h.isOpen('garden')) { this.garden.pivot.rotation.y = -1.5; this.garden.beyondLight.intensity = 2.2; }
    if (h.finch === 'garden') { this.finch.visible = false; this.finchUp.visible = false; this.moths.userData.setOpacity(0.25); this._stood = true; }
    if (this.ctx.state.get('cons.tallow.here')) { this.tallow.visible = true; this.tallow.position.set(-2.4, 0, 2.1); this.tallow.rotation.y = Math.PI / 2 - 0.6; }
  }

  enter() {
    const { ctx } = this;
    this._leaving = false;
    this._carried.set(this.house.lantern === 'carried');
    ctx.audio.setClockRunning?.(this.house.s.clock > 0);
    if (!ctx.state.get('conservatory.intro.seen')) {
      ctx.state.set('conservatory.intro.seen', true);
      this._timers.push(setTimeout(async () => {
        if (ctx.game.currentRoom !== this) return;
        this.finch.userData.lookAt(ctx.camera.camera.position.clone(), 10);
        await ctx.dialogue.say('conservatory.intro');
      }, 1200));
    }
  }
  enterTitle() { this._carried.set(false); }
  exit() { for (const t of this._timers) clearTimeout(t); this._timers = []; this._carried.set(false); this._endPicking(); }

  update(dt, t) {
    this._carried.update(dt, t);
    // the moths go where the warm thing is: the carried lantern, else the lantern on his table, else him
    const tgt = this._mothTarget;
    if (this.house.lantern === 'carried') { this._carried.light.getWorldPosition(tgt); tgt.y += 0.15; }
    else if (this.house.lanternWith === 'finch') this.tableLantern.getWorldPosition(tgt).add(new THREE.Vector3(-0.1, 0.45, -0.1));
    else if (this.house.finch === 'garden') tgt.set(this.garden.door.position.x + 0.6, 1.4, 0.0);
    else tgt.set(CHAIR.pos[0], 1.05, CHAIR.pos[2]);
    this.moths.position.lerp(tgt, Math.min(1, dt * 0.9));
  }
}

// ───────────────────────────────────────────────── canvas drawings
function drawTrees(g, w, h, seed, count) {
  const r = rng(seed);
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#04050a'; g.lineCap = 'round';
  const branch = (x, y, len, ang, depth) => {
    if (depth === 0 || len < 3) return;
    const x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len;
    g.lineWidth = Math.max(1, depth * 1.8); g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) branch(x2, y2, len * (0.58 + r() * 0.25), ang + (r() - 0.5) * 1.5, depth - 1);
  };
  for (let k = 0; k < count; k++) branch(w * (0.15 + r() * 0.7), h * 1.05, h * (0.22 + r() * 0.12), Math.PI / 2 + (r() - 0.5) * 0.5, 6);
}

function drawGarden(g, w, h) {
  const r = rng(5);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#070a16'); sky.addColorStop(0.6, '#141c34'); sky.addColorStop(1, '#0c1018');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // ground and a flagged path going away
  g.fillStyle = '#0d1210'; g.fillRect(0, h * 0.68, w, h * 0.32);
  g.fillStyle = '#2a2c2a';
  for (let i = 0; i < 7; i++) { const y = h * (0.7 + i * 0.045), ww = w * (0.1 + i * 0.05); g.fillRect(w / 2 - ww / 2, y, ww, h * 0.03); }
  // a far gate
  g.strokeStyle = '#1a1e24'; g.lineWidth = 3; g.strokeRect(w * 0.44, h * 0.56, w * 0.12, h * 0.12);
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(w * (0.44 + i * 0.024), h * 0.56); g.lineTo(w * (0.44 + i * 0.024), h * 0.68); g.stroke(); }
  // trees either side
  g.strokeStyle = '#05070c'; g.lineCap = 'round';
  const branch = (x, y, len, ang, depth) => { if (depth === 0) return; const x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len; g.lineWidth = depth * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); for (let i = 0; i < 2 + Math.floor(r() * 2); i++) branch(x2, y2, len * 0.65, ang + (r() - 0.5) * 1.4, depth - 1); };
  branch(w * 0.12, h * 0.75, h * 0.2, Math.PI / 2 + 0.2, 6); branch(w * 0.88, h * 0.78, h * 0.22, Math.PI / 2 - 0.15, 6);
  // rain
  g.strokeStyle = 'rgba(180,200,240,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 300; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 18); g.stroke(); }
}

function drawThermometer(g, w, h) {
  g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8a8070'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#d8d0c0'; g.fillRect(w * 0.45, h * 0.08, w * 0.1, h * 0.8);
  g.fillStyle = '#b8282a'; g.fillRect(w * 0.46, h * 0.5, w * 0.08, h * 0.38); g.beginPath(); g.arc(w / 2, h * 0.9, w * 0.1, 0, TAU); g.fill();
  g.fillStyle = '#4a4036'; g.font = `${Math.round(h * 0.035)}px Inter, sans-serif`; g.textAlign = 'right';
  for (let i = 0; i <= 8; i++) { const y = h * (0.1 + i * 0.1); g.fillRect(w * 0.3, y, w * 0.12, 1.5); g.fillText(String(110 - i * 10), w * 0.28, y + 4); }
  g.textAlign = 'center'; g.font = `italic ${Math.round(h * 0.04)}px "Cormorant Garamond", Georgia, serif`; g.fillText('°F', w * 0.72, h * 0.06);
}

function drawBadge(g, w, h) {
  g.clearRect(0, 0, w, h);
  const gr = g.createRadialGradient(w * 0.4, h * 0.35, w * 0.05, w / 2, h / 2, w / 2);
  gr.addColorStop(0, '#e2c270'); gr.addColorStop(1, '#8a6a2a');
  g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); g.fill();
  g.strokeStyle = '#5a4418'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, TAU); g.stroke();
  g.fillStyle = '#2e2008'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.075)}px "Cormorant Garamond", Georgia, serif`;
  g.fillText('NIGHT LOCKSMITH', w / 2, h * 0.25, w * 0.62);
  g.font = `italic 700 ${Math.round(h * 0.1)}px "Cormorant Garamond", Georgia, serif`; g.fillText('No.', w / 2, h * 0.37);
  // the number, struck deep: as big as the badge allows, so it reads at a glance
  g.font = `700 ${Math.round(h * 0.4)}px "Cormorant Garamond", Georgia, serif`;
  g.fillStyle = 'rgba(255,240,200,0.35)'; g.fillText('417', w / 2 + 1.5, h * 0.64 + 1.5);
  g.fillStyle = '#24180a'; g.fillText('417', w / 2, h * 0.64);
}

function drawDigit(g, w, h, v) {
  g.fillStyle = '#0c0a08'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#efe6cc'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.7)}px Inter, sans-serif`; g.fillText(String(v), w / 2, h * 0.54);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, h * 0.12); g.fillRect(0, h * 0.88, w, h * 0.12);
}
