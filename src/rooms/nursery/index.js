// THE NURSERY (`nursery`). See docs/GAME.md §6.
//
// Layout (metres, floor centre origin, north = −Z; the player stands just inside the landing door at the south end, looking north):
//   south (+Z, behind): the landing door, standing open (always; the way back to the foyer's landing); height marks on its frame
//   west  (−X): the bed, made with corners; the doll's house on a low table
//   north (−Z): the sash window over the street (the van, hazards going); the rocking horse; a chest of drawers
//   east  (+X): the workbench: nine picks on green baize, the vice, his lamp, the drawing pinned above, the mock front door;
//               Mr. Wick on his stool with his back to you
// Locks: dolls (six shutters: top-left, middle-right, bottom-left open), mock (cut the blank 2 3 1 3 2, needs the blank).
import * as THREE from 'three';
import { Room } from '../../engine/Room.js';
import * as M from '../../engine/props/materials.js';
import * as F from '../../engine/props/furniture.js';
import * as P from '../../engine/props/particles.js';
import * as L from '../../engine/props/lights.js';
import { makeCanvasPlane } from '../../engine/props/text.js';
import { rng, noiseTexture, makeCanvas, canvasTexture } from '../../engine/props/textures.js';
import { makeFigure } from '../../engine/props/figure.js';
import { cobweb } from '../foyer/clock.js';
import { mergeStatic, carriedLight, tileTexture, lanternProp } from '../shared.js';
import { items as ITEMS } from '../../content/items.js';

const TAU = Math.PI * 2;
const W = 5.6, D = 5.0, H = 3.0;
const DOLLS_SOLUTION = [true, false, false, true, true, false]; // index = row * 2 + col: top-left, middle-right, bottom-left open
const CUT_SOLUTION = [2, 3, 1, 3, 2];
const CUT_STEP = 0.016;                                           // one step of bitting height
const BENCH = { x: 2.38, top: 0.70, z: -0.1, len: 2.0, depth: 0.7 };
const WICK = { pos: [1.84, 0, -0.5], yaw: Math.PI / 2 };          // on his stool, facing the bench (east)
const DOOR = { x: -0.7, w: 0.95, h: 2.05 };
const TALLOW_DOOR = { pos: [-0.7, 0, 2.25], yaw: Math.PI };
const DOLLS = { pos: [-2.25, 0.45, 0.6], openAngle: -2.3 };
// where she stands after a ring (and on a reload): dolls is north of the low table, clear of the front as it swings out
// and of the close-up camera in front of it; both well away from the player's vantage
// after the call she stands beside the player on the west (bed) side of the landing door: out of the vantage's view to the
// bench, the mock door and the drawing, out of both doll's house poses, and clear of the way out
const TALLOW_CALLED = { pos: [-2.2, 0, 2.0], yaw: 1.6 };
const TALLOW_SPOTS = { dolls: { pos: [-1.5, 0, -0.2], yaw: -0.7 }, mock: { pos: [1.75, 0, 0.75], yaw: Math.PI / 2 } };

/** Has the blank been through the vice? Read from the save, so it holds before the nursery is built (a reload in the cellar). */
const BLANK = { name: ITEMS.blank?.name || 'A key blank', examine: ITEMS.blank?.examine || '' };
function blankCuts() {
  const st = globalThis.skeletonKey?.ctx?.state;
  const cuts = st?.get?.('nursery.cuts', null);
  return Array.isArray(cuts) ? cuts : null;
}
function blankFiled() { const c = blankCuts(); return !!c && c.some((v) => v !== 3); }
if (ITEMS.blank && !Object.getOwnPropertyDescriptor(ITEMS.blank, 'name').get) {
  Object.defineProperty(ITEMS.blank, 'name', { get: () => (blankFiled() ? 'The filed key' : BLANK.name), configurable: true, enumerable: true });
  Object.defineProperty(ITEMS.blank, 'examine', {
    get: () => (blankFiled() ? `The blank from the little house, filed in his vice: ${blankCuts().join(', ')}. You would still rather not think about where they get them.` : BLANK.examine),
    configurable: true, enumerable: true,
  });
}

export default class Nursery extends Room {
  static id = 'nursery';
  static title = 'The Nursery';
  static vantage = { position: [0.1, 1.6, 1.9], lookAt: [0.3, 1.05, -1.2], yawLimit: 175, pitchLimit: 30, fov: 62 };
  static puzzleOrder = ['dolls', 'mock'];

  async build() {
    const { ctx } = this;
    this.background = new THREE.Color('#07060a');
    this.fog = new THREE.FogExp2('#0b0910', 0.04);
    this.envIntensity = 0.3;
    this.exposure = 1.12;
    this.bloom = { strength: 0.36, threshold: 0.82, radius: 0.5 };
    this._timers = [];
    this.statics = new THREE.Group(); this.statics.name = 'statics'; this.group.add(this.statics);
    this._buildShell();
    this._buildLights();
    this._buildSouth();
    this._buildBed();
    this._buildDolls();
    this._buildNorth();
    this._buildBench();
    this._buildMock();
    this._buildWick();
    this._buildTallow();
    this._buildDressing();
    this.group.updateMatrixWorld(true);
    mergeStatic(this.statics);
    this._restore();
    this._carried = carriedLight(ctx, this.group);
  }

  // ───────────────────────────────────────────────── helpers
  _hs(spec) { return this.ctx.hotspots.add(spec); }
  _proxy(w, h, d, pos, parent = this.group) { const p = this.ctx.hotspots.proxyBox(w, h, d); p.position.set(...pos); parent.add(p); return p; }
  get house() { return this.ctx.house; }
  get lit() { return this.house.lantern === 'carried'; }
  /** The HUD's Back with no close-up open: out to the landing and down (see `onBack`). */
  backLabel = 'The hall';
  onBack() {
    const { ctx } = this;
    if (ctx.camera.inFocus || ctx.dialogue.isOpen || ctx.dialogue.busy || this._leaving) return false;
    this._leave();
    return true;
  }

  // ───────────────────────────────────────────────── shell: lamb wallpaper over a painted dado, boards, a low ceiling
  _buildShell() {
    const S = this.statics;
    const wall = new THREE.MeshStandardMaterial({ map: lambWallpaper(), roughness: 0.96 });
    wall.map.repeat.set(4.2, 2.2);
    const floor = M.floorboards({ tint: '#6e5236', repeat: [2.2, 2] });
    const shell = F.roomShell({ w: W, d: D, h: H, floor, wall, ceiling: M.plaster({ tint: '#8a7f70', repeat: [2, 2] }), beams: 0, wainscot: 0, baseboard: false, omit: ['south'] });
    this.group.add(shell);
    mergeStatic(shell, [shell.userData.floor, shell.userData.ceiling, ...Object.values(shell.userData.walls)]);
    // the south wall by hand, so the landing door is a real opening in it (ShapeGeometry uvs are metres: tile the paper to match)
    const southWall = wall.clone(); southWall.map = wall.map.clone(); southWall.map.repeat.set(4.2 / W, 2.2 / H); southWall.map.needsUpdate = true;
    const shape = new THREE.Shape(); shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.closePath();
    const hole = new THREE.Path(); const hx0 = -DOOR.x - DOOR.w / 2, hx1 = -DOOR.x + DOOR.w / 2;
    hole.moveTo(hx0, 0); hole.lineTo(hx1, 0); hole.lineTo(hx1, DOOR.h + 0.05); hole.lineTo(hx0, DOOR.h + 0.05); hole.closePath(); shape.holes.push(hole);
    const south = new THREE.Mesh(new THREE.ShapeGeometry(shape), southWall); south.position.set(0, 0, D / 2); south.rotation.y = Math.PI; south.receiveShadow = true; S.add(south);
    // a painted dado: tongue-and-groove boards gone the green of old hospitals, a rail on top, a skirting below
    const paint = new THREE.MeshStandardMaterial({ color: '#7f8f78', roughness: 0.85, bumpMap: noiseTexture({ scale: 6, seed: 41 }), bumpScale: 0.15 });
    const rail = M.matte('#dcd4bf', { roughness: 0.7 });
    const dado = (len, x, z, ry) => {
      const p = F.rbox(len, 0.92, 0.02, paint, 0.003); p.position.set(x, 0.46, z); p.rotation.y = ry; p.translateZ(0.012); S.add(p);
      for (let i = 1; i < Math.floor(len / 0.11); i++) { const g = F.rbox(0.004, 0.86, 0.006, M.matte('#5e6c58'), 0.001); g.position.set(x, 0.46, z); g.rotation.y = ry; g.translateZ(0.024); g.translateX(-len / 2 + i * 0.11); S.add(g); }
      const r = F.rbox(len, 0.05, 0.045, rail, 0.008); r.position.set(x, 0.945, z); r.rotation.y = ry; r.translateZ(0.025); S.add(r);
      const sk = F.rbox(len, 0.12, 0.035, rail, 0.006); sk.position.set(x, 0.06, z); sk.rotation.y = ry; sk.translateZ(0.02); S.add(sk);
    };
    dado(W, 0, -D / 2, 0); dado(DOOR.x - DOOR.w / 2 - 0.115 + W / 2, (DOOR.x - DOOR.w / 2 - 0.115 - W / 2) / 2, D / 2, Math.PI); dado(W / 2 - (DOOR.x + DOOR.w / 2 + 0.115), (W / 2 + DOOR.x + DOOR.w / 2 + 0.115) / 2, D / 2, Math.PI); dado(D, -W / 2, 0, Math.PI / 2); dado(D, W / 2, 0, -Math.PI / 2);
    // cornice
    const cornice = M.matte('#cfc6b2', { roughness: 0.8 });
    for (const [len, x, z, ry] of [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]]) { const c = F.rbox(len, 0.1, 0.08, cornice, 0.01); c.position.set(x, H - 0.05, z); c.rotation.y = ry; c.translateZ(0.04); S.add(c); }
    this.shell = shell;
  }

  _buildLights() {
    const G = this.group;
    G.add(L.ambientRig({ sky: '#8fa0d8', ground: '#2a1e16', hemi: 0.5, ambient: '#3a3238', ambientIntensity: 0.45 }));
    // moonlight through the north window, falling south across the boards
    const moon = L.keyLight({ color: '#9fb6ff', intensity: 11, position: [0.6, 3.1, -3.2], target: [0.3, 0, 0.9], angle: 0.55, penumbra: 0.7, distance: 14, castShadow: true });
    G.add(moon); this.moonLight = moon.userData.light;
    const fill = new THREE.PointLight('#6a74a8', 1.3, 9, 2); fill.position.set(0, 2.5, 0.2); G.add(fill);
    // the landing beyond the door: a warm dark
    const landing = new THREE.PointLight('#ffb070', 1.4, 5, 2); landing.position.set(DOOR.x, 1.7, D / 2 + 0.4); G.add(landing);
    // the one warm thing in the room: his bench lamp
    this.lampLight = L.flickerLight({ color: '#ffc070', intensity: 2.4, distance: 4.5, flicker: 0.06, speed: 0.8 }); this.lampLight.position.set(2.2, 1.12, -1.0); G.add(this.lampLight);
    const benchWash = new THREE.PointLight('#d8c8a0', 0.9, 4, 2); benchWash.position.set(1.9, 1.9, 0.3); G.add(benchWash);
    const westWash = new THREE.PointLight('#b0a0c0', 1.0, 6, 2); westWash.position.set(-2.0, 2.2, 0.2); G.add(westWash);
    // the hazards on the van, through the window: an amber blink on the sill
    this.hazardLight = new THREE.PointLight('#ff9a30', 0, 3.6, 2); this.hazardLight.position.set(0.6, 1.3, -2.3); G.add(this.hazardLight);
  }

  // ───────────────────────────────────────────────── south: the landing door, open, and the height marks on its frame
  _buildSouth() {
    const S = this.statics, G = this.group, { ctx } = this;
    const paint = M.matte('#ddd5bf', { roughness: 0.6 });
    const dark = M.matte('#bdb39c', { roughness: 0.7 });
    const frame = new THREE.Group(); frame.position.set(DOOR.x, 0, D / 2 - 0.06); S.add(frame);
    for (const s of [-1, 1]) { const j = F.rbox(0.11, DOOR.h + 0.1, 0.16, paint, 0.008); j.position.set(s * (DOOR.w / 2 + 0.055), (DOOR.h + 0.1) / 2, 0); frame.add(j); }
    const head = F.rbox(DOOR.w + 0.22, 0.12, 0.16, paint, 0.008); head.position.set(0, DOOR.h + 0.11, 0); frame.add(head);
    const arch = F.rbox(DOOR.w + 0.3, 0.06, 0.05, paint, 0.008); arch.position.set(0, DOOR.h + 0.2, 0.06); frame.add(arch);
    // the landing beyond: dark, the top of the stair, a rail
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.MeshStandardMaterial({ color: '#1a1410', emissive: '#241810', emissiveIntensity: 0.4, roughness: 1 }));
    beyond.position.set(DOOR.x, 1.3, D / 2 + 0.7); beyond.rotation.y = Math.PI; G.add(beyond);
    const landingFloor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), M.floorboards({ tint: '#4a3624', repeat: [1, 0.5] })); landingFloor.rotation.x = -Math.PI / 2; landingFloor.position.set(DOOR.x, 0.001, D / 2 + 0.35); G.add(landingFloor);
    const newel = F.lathe([[0.05, 0], [0.05, 0.9], [0.07, 0.95], [0.05, 1.0], [0, 1.05]], M.walnut({ tint: '#3a2418' }), 12); newel.position.set(DOOR.x + 0.55, 0, D / 2 + 0.55); G.add(newel);
    // the leaf, hinged on the west jamb, standing open into the room
    const pivot = new THREE.Group(); pivot.position.set(DOOR.x - DOOR.w / 2, 0, D / 2 - 0.06); pivot.rotation.y = -2.1; G.add(pivot);
    const leaf = F.rbox(DOOR.w - 0.02, DOOR.h - 0.02, 0.045, paint, 0.006); leaf.position.set((DOOR.w - 0.02) / 2, DOOR.h / 2, 0); pivot.add(leaf);
    for (const [y, h] of [[1.45, 0.75], [0.55, 0.7]]) { const p = F.rbox(DOOR.w - 0.3, h, 0.012, dark, 0.004); p.position.set((DOOR.w - 0.02) / 2, y, 0.026); pivot.add(p); const p2 = p.clone(); p2.position.z = -0.026; pivot.add(p2); }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), M.brass()); knob.position.set(DOOR.w - 0.12, 0.98, 0.05); pivot.add(knob);
    // a small brass bolt on the room side, drawn: it locks from the outside
    const bolt = F.rbox(0.1, 0.03, 0.02, M.brass(), 0.005); bolt.position.set(DOOR.w - 0.2, 1.1, -0.035); pivot.add(bolt);
    this.landingLeaf = pivot;
    const back = this._proxy(DOOR.w, DOOR.h, 0.3, [DOOR.x, DOOR.h / 2, D / 2 + 0.1]);
    this._hs({ id: 'nursery.back', object: back, label: 'Back to the landing', onClick: () => this._leave() });
    // height marks pencilled on the east jamb, the room side
    const marks = makeCanvasPlane(0.1, 1.7, (g, w, h) => drawMarks(g, w, h), { px: 1024 });
    marks.position.set(DOOR.x + DOOR.w / 2 + 0.055, 0.95, D / 2 - 0.145); marks.rotation.y = Math.PI; marks.material.roughness = 0.6; marks.userData.keep = true; G.add(marks);
    const mproxy = this._proxy(0.16, 1.7, 0.06, [0, 0, 0.01], marks);
    this._hs({
      id: 'nursery.marks', object: mproxy, label: 'Height marks', highlight: marks,
      onClick: async () => {
        const p = marks.getWorldPosition(new THREE.Vector3()); p.y = 1.15;
        await ctx.camera.focus({ position: [p.x - 0.05, 1.2, p.z - 0.62], lookAt: [p.x, 1.12, p.z], scope: 'focus:nursery.marks', fov: 36, onExit: () => ctx.dialogue.hideCaption() });
        if (this._inScope('focus:nursery.marks')) ctx.dialogue.caption('caption.marks', { duration: 7 });
      },
    });
  }

  async _leave() {
    const { ctx } = this;
    if (this._leaving) return;
    this._leaving = true;
    try {
      if (this.house.isOpen('mock') && this._wickHere() && !ctx.state.get('nursery.dontcome.said')) {
        ctx.state.set('nursery.dontcome.said', true);
        this._wickFigure().userData.lookAt(ctx.camera.camera.position.clone(), 6);
        await ctx.dialogue.say('react.wick.dontcome');
      }
      ctx.state.set('foyer.enterAt', 'landing');
      await ctx.game.goToRoom('foyer');
    } finally { this._leaving = false; }
  }

  // ───────────────────────────────────────────────── west: the bed, made with corners
  _buildBed() {
    const S = this.statics, { ctx } = this;
    const bed = new THREE.Group(); bed.position.set(-2.28, 0, -1.3); S.add(bed);
    const iron = M.matte('#d8d2c2', { roughness: 0.5, metalness: 0.2 });
    const bw = 0.92, bl = 1.95, mh = 0.5;
    // an iron bedstead: posts, rails, a few spindles at head and foot
    const post = (x, z, h) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, h, 10), iron); p.position.set(x, h / 2, z); bed.add(p); const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.brass()); k.position.set(x, h + 0.02, z); bed.add(k); };
    post(-bw / 2, -bl / 2, 1.15); post(bw / 2, -bl / 2, 1.15); post(-bw / 2, bl / 2, 0.8); post(bw / 2, bl / 2, 0.8);
    const rail = (z, y) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, bw, 8), iron); r.rotation.z = Math.PI / 2; r.position.set(0, y, z); bed.add(r); };
    rail(-bl / 2, 1.05); rail(-bl / 2, 0.6); rail(bl / 2, 0.72); rail(bl / 2, 0.45);
    for (let i = 1; i < 6; i++) { const x = -bw / 2 + (bw * i) / 6; const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.45, 6), iron); s1.position.set(x, 0.825, -bl / 2); bed.add(s1); const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.27, 6), iron); s2.position.set(x, 0.585, bl / 2); bed.add(s2); }
    for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, bl), iron); side.position.set(s * bw / 2, 0.36, 0); bed.add(side); }
    // mattress, then the blanket pulled tight, the sheet turned down, and the corners folded under like an envelope
    const mattress = F.rbox(bw - 0.04, 0.16, bl - 0.06, M.matte('#c9bfa8', { roughness: 0.95 }), 0.04); mattress.position.set(0, 0.42, 0); bed.add(mattress);
    const wool = new THREE.MeshStandardMaterial({ color: '#6e7a62', roughness: 1, bumpMap: noiseTexture({ scale: 30, seed: 52 }), bumpScale: 0.3 });
    const blanket = F.rbox(bw - 0.02, 0.05, bl - 0.5, wool, 0.02); blanket.position.set(0, mh + 0.025, 0.2); bed.add(blanket);
    for (const s of [-1, 1]) { const drop = F.rbox(0.03, 0.26, bl - 0.56, wool, 0.01); drop.position.set(s * (bw / 2 - 0.005), mh - 0.1, 0.2); bed.add(drop); }
    const foot = F.rbox(bw - 0.02, 0.26, 0.03, wool, 0.01); foot.position.set(0, mh - 0.1, bl / 2 - 0.045); bed.add(foot);
    for (const s of [-1, 1]) { const corner = F.rbox(0.2, 0.25, 0.03, wool, 0.01); corner.position.set(s * (bw / 2 - 0.08), mh - 0.1, bl / 2 - 0.11); corner.rotation.y = s * 0.78; bed.add(corner); }
    const sheet = F.rbox(bw - 0.02, 0.025, 0.22, M.matte('#ece6d8', { roughness: 0.9 }), 0.01); sheet.position.set(0, mh + 0.05, -0.65); bed.add(sheet);
    const pillow = F.rbox(bw - 0.3, 0.1, 0.36, M.matte('#f0eadc', { roughness: 0.9 }), 0.04); pillow.position.set(0, mh + 0.06, -bl / 2 + 0.28); bed.add(pillow);
    // a knitted lamb on the pillow, the eyes gone
    const lamb = new THREE.Group(); lamb.position.set(0.22, mh + 0.11, -bl / 2 + 0.3); lamb.rotation.y = 0.7; bed.add(lamb);
    const fleece = M.matte('#e2dccb', { roughness: 1 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), fleece); body.scale.set(1.3, 0.8, 1); body.position.y = 0.04; lamb.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.matte('#3a3230')); head.position.set(0.08, 0.08, 0); lamb.add(head);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), M.matte('#3a3230')); ear.scale.set(1.6, 0.6, 1); ear.position.set(0.08, 0.1, s * 0.03); lamb.add(ear); }
    const bproxy = this._proxy(bw, 0.5, bl, [0, 0.45, 0], bed);
    this._hs({ id: 'nursery.bed', object: bproxy, label: 'The bed', highlight: blanket, onClick: () => ctx.dialogue.caption('caption.bed') });
    // a nightstand with a candle never lit, and a book face down
    const stand = F.table({ w: 0.42, d: 0.38, h: 0.62, material: M.walnut({ tint: '#4a3020' }), legs: 'square' }); stand.position.set(-2.4, 0, -0.05); S.add(stand);
    const candle = F.candle({ h: 0.12, r: 0.014, holder: 'stick', light: false, lit: false }); candle.position.set(-0.1, 0.62, 0.05); stand.add(candle);
    const book = F.book({ w: 0.035, h: 0.16, d: 0.11, color: '#5a2a2a' }); book.rotation.z = Math.PI / 2; book.rotation.y = 0.3; book.position.set(0.08, 0.62 + 0.018, -0.06); stand.add(book);
    this.bed = bed;
  }

  // ───────────────────────────────────────────────── west: the doll's house on its low table
  _buildDolls() {
    const S = this.statics, G = this.group, { ctx } = this;
    const table = F.table({ w: 0.95, d: 0.6, h: 0.45, material: M.oak({ tint: '#6a4a2a' }), legs: 'square' }); table.position.set(DOLLS.pos[0], 0, DOLLS.pos[2]); table.rotation.y = Math.PI / 2; S.add(table);
    // the house, to the inch: local +Z is its front, turned to face east into the room
    const house = new THREE.Group(); house.position.set(...DOLLS.pos); house.rotation.y = Math.PI / 2; G.add(house);
    const HW = 0.7, HD = 0.4, HH = 0.78;
    const brick = M.stone({ tint: '#7a4a3c', rows: 10, cols: 6, repeat: [3, 2], seed: 9 });
    const cream = M.matte('#d9d0b4', { roughness: 0.8 });
    const shellM = M.matte('#3a2e26', { roughness: 0.9 });
    const panel = (w, h, d, mat, pos, rot) => { const m = F.rbox(w, h, d, mat, 0.003); m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = true; house.add(m); return m; };
    panel(HW, HH, 0.015, brick, [0, HH / 2, -HD / 2 + 0.0075]);
    panel(0.015, HH, HD, brick, [-HW / 2 + 0.0075, HH / 2, 0]); panel(0.015, HH, HD, brick, [HW / 2 - 0.0075, HH / 2, 0]);
    panel(HW, 0.015, HD, shellM, [0, 0.0075, 0]);
    panel(HW - 0.03, 0.012, HD - 0.03, shellM, [0, 0.40, 0]);          // the first floor: dark above
    // the little hall: tiles, a stair at the back left, a hall table, a coat stand
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(HW - 0.03, HD - 0.03), new THREE.MeshStandardMaterial({ map: tileTexture({ a: '#15110f', b: '#b7ab96' }), roughness: 0.4 }));
    tiles.material.map.repeat.set(7, 4); tiles.rotation.x = -Math.PI / 2; tiles.position.set(0, 0.016, 0); house.add(tiles);
    const paper = new THREE.MeshStandardMaterial({ map: lambWallpaper(), roughness: 0.9 }); paper.map.repeat.set(1.2, 0.6);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(HW - 0.03, 0.38), paper); inner.position.set(0, 0.2, -HD / 2 + 0.016); house.add(inner);
    const stairWood = M.walnut({ tint: '#3a2418' });
    for (let i = 0; i < 6; i++) { const st = F.rbox(0.05, 0.05, 0.12, stairWood, 0.002); st.position.set(-0.3 + i * 0.045, 0.04 + i * 0.05, -0.1); house.add(st); }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 5), M.velvet({ color: '#6a1a1c' })); rope.rotation.x = Math.PI / 2; rope.position.set(-0.2, 0.12, -0.03); house.add(rope);
    const hallTable = F.rbox(0.12, 0.004, 0.05, stairWood, 0.001); hallTable.position.set(0.22, 0.07, -0.13); house.add(hallTable);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 5), stairWood); l.position.set(0.22 + s * 0.05, 0.05, -0.13); house.add(l); }
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), M.brass({ polished: true })); bell.position.set(0.25, 0.08, -0.13); house.add(bell);
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), stairWood); coat.position.set(0.3, 0.1, 0.1); house.add(coat);
    const tinyClock = F.rbox(0.03, 0.14, 0.02, stairWood, 0.002); tinyClock.position.set(-0.31, 0.09, 0.06); house.add(tinyClock);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.009, 10), M.matte('#e8dcc0')); face.position.set(-0.295, 0.13, 0.06); face.rotation.y = Math.PI / 2; house.add(face);
    // the blank on the tiles, and the torn line folded under the little stair
    const blank = this._keyMesh({ len: 0.095, uncut: true }); blank.position.set(0.04, 0.02, 0.07); blank.rotation.set(0, 0.5, 0); house.add(blank);
    const bproxy = this._proxy(0.16, 0.08, 0.14, [0, 0, 0.01], blank);
    const torn = makeCanvasPlane(0.05, 0.028, (g, w, h) => { g.fillStyle = '#d8ccae'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4a3a2a'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w * 0.1, h * (0.3 + i * 0.22)); g.lineTo(w * (0.6 + i * 0.1), h * (0.3 + i * 0.22)); g.stroke(); } }, { px: 128 });
    torn.rotation.x = -Math.PI / 2; torn.rotation.z = 0.3; torn.position.set(-0.2, 0.019, -0.02); torn.material.roughness = 0.9; house.add(torn);
    const tproxy = this._proxy(0.12, 0.06, 0.1, [0, 0.01, 0], torn);
    const innerLight = new THREE.PointLight('#ffd9a0', 0, 0.9, 2); innerLight.position.set(0.05, 0.3, 0.06); house.add(innerLight);
    // the roof: two slopes, two gables, a chimney
    const slate = M.matte('#3b3f46', { roughness: 0.8 });
    const RH = 0.2, slopeLen = Math.hypot(HD / 2, RH) + 0.02, ang = Math.atan2(RH, HD / 2);
    for (const s of [-1, 1]) { const sl = F.rbox(HW + 0.06, 0.012, slopeLen, slate, 0.002); sl.position.set(0, HH + RH / 2, s * HD / 4); sl.rotation.x = s * ang; house.add(sl); }
    const gable = new THREE.Shape(); gable.moveTo(-HD / 2, 0); gable.lineTo(HD / 2, 0); gable.lineTo(0, RH); gable.closePath();
    for (const s of [-1, 1]) { const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), brick); gm.position.set(s * (HW / 2 - 0.008), HH, 0); gm.rotation.y = s * Math.PI / 2; gm.material.side = THREE.DoubleSide; house.add(gm); }
    const chimney = F.rbox(0.05, 0.14, 0.05, brick, 0.002); chimney.position.set(0.22, HH + RH, -0.05); house.add(chimney);
    // the front, hinged on its left edge; six shuttered windows, a little door with a fanlight
    const pivot = new THREE.Group(); pivot.position.set(-HW / 2, 0, HD / 2); house.add(pivot);
    const front = makeCanvasPlane(HW, HH, (g, w, h) => drawFacade(g, w, h), { px: 512 });
    front.position.set(HW / 2, HH / 2, 0.01); front.material.roughness = 0.85; pivot.add(front);
    const frontBack = F.rbox(HW, HH, 0.018, brick, 0.002); frontBack.position.set(HW / 2, HH / 2, 0); pivot.add(frontBack);
    const shutterM = M.matte('#2f4a3a', { roughness: 0.7 });
    const paneM = new THREE.MeshStandardMaterial({ color: '#0e1216', roughness: 0.2, emissive: '#000000' });
    const windows = [];
    const cols = [-0.19, 0.19], rows = [0.62, 0.42, 0.21];
    rows.forEach((y, r) => cols.forEach((cx, c) => {
      const i = r * 2 + c;
      const win = new THREE.Group(); win.position.set(HW / 2 + cx, y, 0.012); pivot.add(win);
      const fr = F.rbox(0.13, 0.15, 0.012, cream, 0.002); win.add(fr);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.12), paneM.clone()); pane.position.z = 0.0065; win.add(pane);
      for (let k = 0; k < 2; k++) { const bar = F.rbox(k ? 0.1 : 0.004, k ? 0.004 : 0.12, 0.003, cream, 0.001); bar.position.z = 0.008; win.add(bar); }
      const leaves = [];
      for (const s of [-1, 1]) {
        const hp = new THREE.Group(); hp.position.set(s * 0.055, 0, 0.016); win.add(hp);
        const lf = F.rbox(0.053, 0.135, 0.008, shutterM, 0.002); lf.position.set(-s * 0.0265, 0, 0); hp.add(lf);
        for (let k = 0; k < 5; k++) { const slat = F.rbox(0.04, 0.004, 0.003, M.matte('#1e3328'), 0.001); slat.position.set(-s * 0.0265, -0.05 + k * 0.025, 0.0055); hp.add(slat); }
        leaves.push({ pivot: hp, s });
      }
      // somebody at the window, by the lantern
      const figure = makeCanvasPlane(0.1, 0.13, (g, w, h) => drawFigure(g, w, h, i), { px: 128, emissive: true, transparent: true });
      figure.position.z = 0.03; figure.material.opacity = 0; figure.material.depthWrite = false; figure.userData.noRaycast = true; figure.renderOrder = 2; win.add(figure);
      const proxy = this._proxy(0.15, 0.17, 0.08, [0, 0, 0.03], win);
      windows.push({ group: win, pane, leaves, figure, proxy, open: false });
    }));
    // the little front door, a fanlight, a step
    const ldoor = F.rbox(0.13, 0.2, 0.012, M.matte('#1a1410', { roughness: 0.5 }), 0.002); ldoor.position.set(HW / 2, 0.1, 0.012); pivot.add(ldoor);
    const lknob = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), M.brass({ polished: true })); lknob.position.set(HW / 2 + 0.04, 0.1, 0.022); pivot.add(lknob);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.065, 16, 0, Math.PI), M.glass({ color: '#9fb6ff', opacity: 0.35 })); fan.position.set(HW / 2, 0.2, 0.019); fan.renderOrder = 3; pivot.add(fan);
    const fanFrame = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.068, 16, 1, 0, Math.PI), cream); fanFrame.position.set(HW / 2, 0.2, 0.02); pivot.add(fanFrame);
    const step = F.rbox(0.17, 0.012, 0.03, M.smoothStone({ color: '#8a8278' }), 0.002); step.position.set(HW / 2, 0.006, 0.03); pivot.add(step);
    this.dolls = { house, pivot, windows, blank, torn, innerLight };
    // the pose: the front, then down into the little hall once it has come away
    const front3 = () => house.localToWorld(new THREE.Vector3(0, 0.42, HD / 2));
    const pose = () => {
      const f = front3();
      return this.house.isOpen('dolls')
        ? { position: [f.x + 0.72, f.y + 0.3, f.z - 0.06], lookAt: [f.x - 0.2, f.y - 0.3, f.z + 0.02], fov: 44 }
        : { position: [f.x + 1.22, f.y + 0.14, f.z + 0.02], lookAt: [f.x, f.y - 0.02, f.z], fov: 40 };
    };
    const onOpen = async (verb) => {
      ctx.audio.play('unlock', { gain: 0.6, pitch: 1.5 });
      await ctx.tween.delay(0.3);
      ctx.audio.play('drawerOpen', { gain: 0.5, pitch: 1.2 });
      ctx.tween.to(innerLight, { intensity: 0.22 }, { duration: 1.2 });
      await ctx.tween.to(pivot.rotation, { y: DOLLS.openAngle }, { duration: 1.1, ease: 'outCubic' });
      if (ctx.camera.inFocus && ctx.camera.scope === 'focus:nursery.dolls') await ctx.camera.refocus(pose());
      void verb;
    };
    const force = () => this.house.open('dolls', 'force', { onOpen, stay: true });
    const focus = async () => {
      await ctx.camera.focus({ ...pose(), scope: 'focus:nursery.dolls', onExit: () => { this.house.blurLock(); ctx.dialogue.hideCaption(); } });
      if (!this._inScope('focus:nursery.dolls')) return; // left during the move: no Ring button, no late caption
      if (this.house.focusLock('dolls', { onOpen, stay: true }) && !this.house.isOpen('dolls')) ctx.dialogue.caption(this._dollsCaption(), { duration: 7 });
    };
    const hproxy = this._proxy(HW + 0.1, HH + RH + 0.1, HD + 0.1, [0, (HH + RH) / 2, 0], house);
    this._hs({
      id: 'nursery.dolls', object: hproxy, label: () => (this.house.isOpen('dolls') ? "The doll's house, open" : "Doll's house"), highlight: frontBack,
      onClick: () => focus(),
      useItem: { bonekey: () => { if (!this.house.isOpen('dolls')) force(); }, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    windows.forEach((w, i) => {
      this._hs({
        id: `nursery.dolls.shutter${i}`, object: w.proxy, label: 'Shutter', scope: 'focus:nursery.dolls', highlight: w.leaves[0].pivot.children[0],
        enabled: () => !this.house.isOpen('dolls'),
        onClick: () => this._toggleShutter(i, () => this.house.open('dolls', 'pick', { onOpen, stay: true })),
        useItem: { bonekey: force },
      });
    });
    this._hs({
      id: 'nursery.blank', object: bproxy, label: 'A key blank', scope: ['focus:nursery.dolls', 'room'], highlight: blank,
      enabled: () => this.house.isOpen('dolls') && this.house.s.items.blank === 'away',
      onClick: async () => { if (!this.house.take('blank', { from: blank })) return; blank.visible = false; await ctx.dialogue.say('react.blank.found'); },
    });
    this._hs({ id: 'nursery.torn', object: tproxy, label: 'A torn line', scope: ['focus:nursery.dolls', 'room'], highlight: torn, enabled: () => this.house.isOpen('dolls'), onClick: () => ctx.dialogue.say('react.torn') });
  }

  _setShutter(i, open, animated = true) {
    const w = this.dolls.windows[i];
    w.open = open;
    for (const l of w.leaves) {
      const y = open ? -l.s * 2.5 : 0;
      if (animated) this.ctx.tween.to(l.pivot.rotation, { y }, { duration: 0.35, ease: open ? 'outBack' : 'inOutSine' });
      else l.pivot.rotation.y = y;
    }
  }
  _toggleShutter(i, solved) {
    const { ctx } = this;
    const w = this.dolls.windows[i];
    this._setShutter(i, !w.open);
    ctx.audio.play('click', { gain: 0.5, pitch: w.open ? 1.4 : 1.0 });
    const pattern = this.dolls.windows.map((x) => x.open);
    ctx.state.set('nursery.shutters', pattern);
    if (pattern.every((v, j) => v === DOLLS_SOLUTION[j])) { solved(); return; }
    // three open and the wrong three, or more than three: the front says so (only when a shutter was opened, not shut)
    const n = pattern.filter(Boolean).length;
    if (w.open && n >= 3) ctx.dialogue.caption(n === 3 ? 'caption.dolls.wrong' : 'caption.dolls.many', { duration: 4, scope: 'focus:nursery.dolls' });
  }
  /** What the doll's house shows from the close-up while shut: the figures (lantern, or the moon once he has said), or the shutters as they are. */
  _dollsCaption() {
    if (this.lit) return 'caption.dolls.lit';
    if (this.ctx.state.get('nursery.dolls.moon')) return 'caption.dolls.moon';
    return this.dolls.windows.some((w) => w.open) ? 'caption.dolls.dark.open' : 'caption.dolls.dark';
  }
  /** The lantern-only clue: three little figures at the windows while the lantern is carried. */
  _syncDolls(animated) {
    const lit = this.lit, moon = !lit && !!this.ctx.state.get('nursery.dolls.moon');
    this.dolls.windows.forEach((w, i) => {
      const on = (lit || moon) && DOLLS_SOLUTION[i] && !this.house.isOpen('dolls');
      const op = on ? (lit ? 0.9 : 0.5) : 0;
      const m = w.figure.material;
      if (animated) this.ctx.tween.to(m, { opacity: op }, { duration: 1.4 }); else m.opacity = op;
      w.pane.material.emissive.set(on ? (lit ? '#3a2a12' : '#18202e') : '#000000');
    });
  }

  // ───────────────────────────────────────────────── north: the window over the street, the rocking horse, the chest
  _buildNorth() {
    const S = this.statics, G = this.group, { ctx } = this;
    const win = F.windowFrame({ w: 1.1, h: 1.5, arch: false, panes: [2, 3], frameMaterial: M.matte('#ddd5bf', { roughness: 0.6 }), sill: true, rain: 0.6, moonlight: true, shaftTarget: [0.3, 0, 2.2], shaftOpacity: 0.1, skyTop: '#060916', skyBottom: '#141c36', moon: [0.76, 0.86] });
    win.position.set(0.6, 0.86, -D / 2 + 0.07); G.add(win);
    // the street below: the lamp, the kerb, your van; drawn in front of the sky so the rain still falls behind
    const street = makeCanvasPlane(1.1, 1.5, (g, w, h) => drawStreet(g, w, h), { px: 512, emissive: true, transparent: true });
    street.position.set(0, 0.75, -0.015); street.material.alphaTest = 0.05; street.userData.noRaycast = true; win.add(street);
    const amber = new THREE.MeshBasicMaterial({ color: '#ffb040', toneMapped: false });
    this.hazards = [[0.171, 0.477], [0.405, 0.516], [0.249, 0.224], [0.483, 0.262]].map(([u, v]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.02), amber); m.position.set(-0.55 + u * 1.1, v * 1.5, -0.012); m.userData.noRaycast = true; win.add(m); return m; });
    const curtainM = new THREE.MeshStandardMaterial({ color: '#8a6a5a', roughness: 1, side: THREE.DoubleSide, bumpMap: noiseTexture({ scale: 20, seed: 63 }), bumpScale: 0.5 });
    for (const s of [-1, 1]) { const c = F.lathe([[0.06, 0], [0.11, 0.3], [0.12, 1.0], [0.1, 1.55], [0.07, 1.62]], curtainM, 12); c.scale.set(1, 1, 0.5); c.position.set(0.6 + s * 0.68, 0.78, -D / 2 + 0.18); S.add(c); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 8), M.brass()); pole.rotation.z = Math.PI / 2; pole.position.set(0.6, 2.46, -D / 2 + 0.18); S.add(pole);
    const wproxy = this._proxy(1.2, 1.5, 0.2, [0, 0.75, 0.05], win);
    this._hs({ id: 'nursery.window', object: wproxy, label: 'The window', highlight: false, onClick: () => { ctx.dialogue.caption('caption.window'); ctx.camera.lookAtPoint?.(new THREE.Vector3(0.6, 1.4, -D / 2)); } });
    this.window = win;
    // the rocking horse: dapple grey, a red saddle, a mane gone to string
    const horse = new THREE.Group(); horse.position.set(-0.95, 0, -1.7); horse.rotation.y = 0.75; G.add(horse);
    const rock = new THREE.Group(); rock.position.y = 0.56; horse.add(rock);
    const grey = new THREE.MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.7, bumpMap: noiseTexture({ scale: 14, seed: 71, contrast: 1.6 }), bumpScale: 0.6 });
    const wood = M.walnut({ tint: '#5a3a22' });
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.022, 8, 28, 1.5), wood); r.rotation.set(0, Math.PI / 2, Math.PI + (Math.PI - 1.5) / 2); r.position.set(s * 0.15, 0, 0); rock.add(r); }
    for (const z of [-0.3, 0.3]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), wood); bar.rotation.z = Math.PI / 2; bar.position.set(0, -0.56 + 0.56 - Math.sqrt(0.56 * 0.56 - z * z) + 0.03, z); rock.add(bar); }
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 6, 14), grey); body.rotation.x = Math.PI / 2; body.position.set(0, 0.12, 0); rock.add(body);
    for (const [x, z, a] of [[-0.08, 0.17, 0.35], [0.08, 0.17, 0.35], [-0.08, -0.17, -0.35], [0.08, -0.17, -0.35]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.5, 8), grey); leg.position.set(x, -0.13, z + Math.sin(a) * 0.1); leg.rotation.x = a; rock.add(leg); }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.26, 10), grey); neck.position.set(0, 0.28, 0.2); neck.rotation.x = -0.5; rock.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.22), grey); head.position.set(0, 0.4, 0.32); head.rotation.x = 0.3; rock.add(head);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), grey); ear.position.set(s * 0.035, 0.47, 0.26); ear.rotation.x = -0.3; rock.add(ear); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.matte('#1a1410')); eye.position.set(s * 0.052, 0.43, 0.3); rock.add(eye); }
    const mane = F.rbox(0.03, 0.14, 0.24, M.matte('#3a3230', { roughness: 1 }), 0.01); mane.position.set(0, 0.36, 0.14); mane.rotation.x = -0.5; rock.add(mane);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 0.3, 8), M.matte('#3a3230', { roughness: 1 })); tail.position.set(0, 0.02, -0.3); tail.rotation.x = 0.6; rock.add(tail);
    const saddle = F.rbox(0.16, 0.04, 0.2, M.velvet({ color: '#7a1a1c' }), 0.015); saddle.position.set(0, 0.23, -0.02); rock.add(saddle);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 8), M.brass()); handle.rotation.z = Math.PI / 2; handle.position.set(0, 0.3, 0.1); rock.add(handle);
    const hproxy = this._proxy(0.5, 1.0, 1.3, [0, 0.5, 0], horse);
    this._hs({ id: 'nursery.horse', object: hproxy, label: 'Rocking horse', highlight: body, onClick: () => this._rockHorse() });
    this.horse = rock;
    // a chest of drawers, a row of tin soldiers on it, a candle never lit
    const chest = new THREE.Group(); chest.position.set(2.0, 0, -D / 2 + 0.3); S.add(chest);
    const cw = M.walnut({ tint: '#4a3020' });
    const cbody = F.rbox(0.9, 0.95, 0.46, cw, 0.01); cbody.position.y = 0.475; chest.add(cbody);
    for (let i = 0; i < 3; i++) { const dr = F.rbox(0.8, 0.24, 0.02, M.walnut({ tint: '#5a3a26' }), 0.006); dr.position.set(0, 0.2 + i * 0.28, 0.23); chest.add(dr); for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.brass()); k.position.set(s * 0.25, 0.2 + i * 0.28, 0.25); chest.add(k); } }
    for (let i = 0; i < 6; i++) { const sd = new THREE.Group(); sd.position.set(-0.3 + i * 0.1, 0.95, 0.05); chest.add(sd); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 8), M.matte(i === 3 ? '#4a4a6a' : '#8a2a2a')); b.position.y = 0.025; sd.add(b); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), M.matte('#e2c9a8')); hd.position.y = 0.06; sd.add(hd); const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.025, 8), M.matte('#1a1a1a')); hat.position.y = 0.08; sd.add(hat); if (i === 4) { sd.rotation.z = Math.PI / 2; sd.position.y = 0.962; } }
    const cc = F.candle({ h: 0.14, r: 0.016, holder: 'stick', light: false, lit: false }); cc.position.set(0.32, 0.95, -0.05); chest.add(cc);
  }
  _rockHorse() {
    const { ctx } = this;
    if (this._rocking) return;
    this._rocking = true;
    ctx.dialogue.caption('caption.horse');
    ctx.audio.play('bookSlide', { gain: 0.3, pitch: 0.7 });
    const r = this.horse.rotation;
    ctx.tween.to(r, { x: 0.17 }, { duration: 0.5, ease: 'inOutSine' })
      .then(() => ctx.tween.to(r, { x: -0.12 }, { duration: 0.7, ease: 'inOutSine' }))
      .then(() => ctx.tween.to(r, { x: 0.05 }, { duration: 0.6, ease: 'inOutSine' }))
      .then(() => ctx.tween.to(r, { x: 0 }, { duration: 0.5, ease: 'inOutSine' }))
      .then(() => { this._rocking = false; });
  }

  // ───────────────────────────────────────────────── east: the workbench, the picks on baize, his lamp, the drawing
  _buildBench() {
    const S = this.statics, G = this.group, { ctx } = this;
    const oak = M.oak({ tint: '#5a4028', planks: 4 });
    const bench = F.table({ w: BENCH.depth, d: BENCH.len, h: BENCH.top, material: oak, legs: 'square', topThickness: 0.06 }); bench.position.set(BENCH.x, 0, BENCH.z); S.add(bench);
    const shelf = F.rbox(BENCH.depth - 0.1, 0.025, BENCH.len - 0.2, M.oak({ tint: '#4a3420' }), 0.004); shelf.position.set(0, 0.22, 0); bench.add(shelf);
    // under the bench: a tin, a box of blanks, a coil of wire
    const tin = F.rbox(0.18, 0.1, 0.12, M.iron({ color: '#6a6e70', roughness: 0.5 }), 0.008); tin.position.set(0.05, 0.285, -0.5); bench.add(tin);
    const box = F.rbox(0.22, 0.08, 0.16, M.parchment({ tint: '#b9a070' }), 0.004); box.position.set(-0.05, 0.275, 0.4); box.rotation.y = 0.2; bench.add(box);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 20), M.iron({ color: '#8a8070' })); coil.rotation.x = Math.PI / 2; coil.position.set(0.08, 0.25, 0.0); bench.add(coil);
    // the stool
    const stool = new THREE.Group(); stool.position.set(WICK.pos[0], 0, WICK.pos[2]); S.add(stool);
    const seat = F.lathe([[0, 0.49], [0.17, 0.49], [0.18, 0.51], [0.16, 0.53], [0, 0.53]], M.walnut({ tint: '#3a2418' }), 18); stool.add(seat);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.5, 8), M.walnut({ tint: '#3a2418' })); l.position.set(Math.cos(a) * 0.13, 0.25, Math.sin(a) * 0.13); l.rotation.z = -Math.cos(a) * 0.1; l.rotation.x = Math.sin(a) * 0.1; stool.add(l); }
    // green baize in front of him, nine picks laid out like surgery
    const baize = F.rbox(0.42, 0.006, 0.5, new THREE.MeshStandardMaterial({ color: '#2d5a3a', roughness: 1, bumpMap: noiseTexture({ scale: 40, seed: 81 }), bumpScale: 0.2 }), 0.002); baize.position.set(BENCH.x + 0.08, BENCH.top + 0.003, WICK.pos[2]); S.add(baize);
    const steel = M.iron({ color: '#a8aeb4', roughness: 0.3 });
    const tips = ['hook', 'rake', 'diamond', 'ball', 'hook', 'snake', 'half', 'rake', 'hook'];
    for (let i = 0; i < 9; i++) {
      const pk = new THREE.Group(); pk.position.set(BENCH.x + 0.02, BENCH.top + 0.012, WICK.pos[2] - 0.2 + i * 0.05); pk.rotation.y = Math.PI / 2 + (i % 2 ? 0.03 : -0.02); S.add(pk);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.16), steel); shaft.position.z = 0.0; pk.add(shaft);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.06), M.matte('#2a2622')); grip.position.z = -0.08; pk.add(grip);
      const t = tips[i];
      if (t === 'hook') { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.012), steel); tip.position.set(0, 0.006, 0.08); pk.add(tip); }
      else if (t === 'rake') for (let k = 0; k < 3; k++) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.006), steel); tip.position.set(0, 0.005, 0.055 + k * 0.012); pk.add(tip); }
      else if (t === 'diamond') { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.012, 4), steel); tip.position.set(0, 0.006, 0.075); pk.add(tip); }
      else if (t === 'ball') { const tip = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), steel); tip.position.set(0, 0.005, 0.078); pk.add(tip); }
      else if (t === 'snake') for (let k = 0; k < 2; k++) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.009, 0.014), steel); tip.position.set(0, 0.004 + k * 0.003, 0.05 + k * 0.02); pk.add(tip); }
      else { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.009, 0.02), steel); tip.position.set(0, 0.004, 0.07); pk.add(tip); }
    }
    const pproxy = this._proxy(0.44, 0.08, 0.5, [0, 0.03, 0], baize);
    this._hs({ id: 'nursery.picks', object: pproxy, label: 'Nine picks', highlight: baize, onClick: () => ctx.dialogue.caption('caption.picks') });
    // his lamp: brass, a green glass shade, the light kept on the bench
    const lamp = new THREE.Group(); lamp.position.set(2.45, BENCH.top, -1.0); S.add(lamp);
    const lbase = F.lathe([[0.07, 0], [0.07, 0.015], [0.03, 0.03], [0.012, 0.04], [0.012, 0.32], [0.02, 0.33]], M.brass(), 16); lamp.add(lbase);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), M.brass()); arm.rotation.x = Math.PI / 2 + 0.3; arm.position.set(0, 0.36, -0.06); lamp.add(arm);
    const shade = F.lathe([[0.02, 0], [0.09, 0.02], [0.14, 0.09], [0.15, 0.1], [0.13, 0.1], [0.085, 0.03], [0.02, 0.012]], new THREE.MeshStandardMaterial({ color: '#2a6a48', roughness: 0.3, metalness: 0.3, emissive: '#1a5a30', emissiveIntensity: 0.35, side: THREE.DoubleSide }), 20);
    shade.position.set(0, 0.32, -0.14); shade.rotation.x = 0.35; lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe6b0', toneMapped: false })); bulb.position.set(0, 0.34, -0.14); lamp.add(bulb);
    const lproxy = this._proxy(0.3, 0.5, 0.3, [0, 0.25, -0.05], lamp);
    this._hs({ id: 'nursery.lamp', object: lproxy, label: 'His lamp', highlight: shade, onClick: () => ctx.dialogue.caption('caption.lamp') });
    // oddments: a jar of screws, an oilcan, a rag, two loose keys
    const jar = F.jar({ r: 0.035, h: 0.09, contents: '#7a7470', fill: 0.6, lid: 'brass' }); jar.position.set(2.55, BENCH.top, -0.75); S.add(jar);
    const can = F.lathe([[0.03, 0], [0.035, 0.05], [0.015, 0.07], [0.012, 0.11], [0, 0.11]], M.brass({ color: '#8a7a50' }), 12); can.position.set(2.6, BENCH.top, -0.62); S.add(can);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.006, 0.1, 6), M.brass({ color: '#8a7a50' })); spout.rotation.z = -1.1; spout.position.set(2.64, BENCH.top + 0.1, -0.62); S.add(spout);
    const rag = F.rbox(0.14, 0.012, 0.1, M.matte('#8a7a66', { roughness: 1 }), 0.006); rag.position.set(2.2, BENCH.top + 0.006, 0.78); rag.rotation.y = 0.4; S.add(rag);
    for (let i = 0; i < 2; i++) { const k = this._keyMesh({ len: 0.06, uncut: false, cuts: [3, 1, 2, 3, 1] }); k.position.set(2.5 + i * 0.05, BENCH.top + 0.006, -0.95 + i * 0.09); k.rotation.set(0, 0.9 + i, 0); S.add(k); }
    // the lantern, if he is given it
    const lantern = lanternProp(); lantern.position.set(BENCH.x + 0.16, BENCH.top, WICK.pos[2] + 0.34); lantern.visible = false; G.add(lantern);
    this.benchLantern = lantern;
    // the drawing, pinned above the bench
    const chart = makeCanvasPlane(0.4, 0.3, (g, w, h) => drawChart(g, w, h), { px: 640 });
    chart.position.set(W / 2 - 0.03, 1.52, -0.08); chart.rotation.y = -Math.PI / 2; chart.rotation.z = -0.02; chart.material.roughness = 0.8; chart.userData.keep = true; G.add(chart);
    for (const s of [-1, 1]) { const pin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), M.brass({ polished: true })); pin.position.set(s * 0.18, 0.135, 0.006); chart.add(pin); }
    const cproxy = this._proxy(0.72, 0.56, 0.1, [0, 0, 0.03], chart);
    this._hs({
      id: 'nursery.chart', object: cproxy, label: 'A drawing', highlight: chart, scope: ['room', 'focus:nursery.mock'],
      onClick: async () => {
        const p = chart.getWorldPosition(new THREE.Vector3());
        await ctx.camera.focus({ position: [p.x - 0.5, p.y + 0.02, p.z], lookAt: [p.x, p.y, p.z], scope: 'focus:nursery.chart', fov: 36, onExit: () => ctx.dialogue.hideCaption() });
        if (this._inScope('focus:nursery.chart')) ctx.dialogue.caption('caption.chart', { duration: 8 });
      },
    });
    this.bench = bench;
  }

  /** A yellow key: a bow, a shaft and five bits whose heights are the cuts (3 uncut, 2, 1). Shaft along +Z, bits up. */
  _keyMesh({ len = 0.18, cuts = null, uncut = false } = {}) {
    const g = new THREE.Group(); g.name = 'key';
    const bone = this._bone || (this._bone = new THREE.MeshStandardMaterial({ color: '#e6d490', roughness: 0.45, metalness: 0.1, emissive: '#4a3c10', emissiveIntensity: 0.15 }));
    const sr = len * 0.035;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(sr, sr, len * 0.95, 10), bone); shaft.rotation.x = Math.PI / 2; shaft.position.z = len * 0.1; shaft.castShadow = true; g.add(shaft);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(len * 0.11, sr * 0.9, 8, 16), bone); bow.rotation.y = Math.PI / 2; bow.position.z = -len * 0.38 - len * 0.1; g.add(bow);
    const bits = [];
    const bw = len * 0.11, gap = len * 0.135, step = CUT_STEP * (len / 0.18);
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.BoxGeometry(sr * 1.4, 1, bw); geo.translate(0, 0.5, 0);
      const b = new THREE.Mesh(geo, bone); b.position.set(0, sr * 0.6, len * 0.05 + i * gap); b.castShadow = true;
      const c = uncut ? 3 : (cuts ? cuts[i] : 3);
      b.scale.y = c * step; g.add(b); bits.push(b);
    }
    g.userData.bits = bits; g.userData.step = step;
    return g;
  }

  // ───────────────────────────────────────────────── east: the vice, the blank, and the mock front door
  _buildMock() {
    const G = this.group, S = this.statics, { ctx } = this;
    // the vice, bolted to the bench
    const vice = new THREE.Group(); vice.position.set(2.3, BENCH.top, 0.1); S.add(vice);
    const cast = M.iron({ color: '#3a3c3e', roughness: 0.6 });
    const vbase = F.rbox(0.18, 0.035, 0.14, cast, 0.006); vbase.position.y = 0.0175; vice.add(vbase);
    const column = F.rbox(0.09, 0.08, 0.09, cast, 0.008); column.position.set(0, 0.07, 0); vice.add(column);
    for (const s of [-1, 1]) { const jaw = F.rbox(0.03, 0.1, 0.07, cast, 0.004); jaw.position.set(s * 0.025, 0.15, -0.03); vice.add(jaw); const face = F.rbox(0.004, 0.09, 0.065, M.iron({ color: '#8a8e92', roughness: 0.4 }), 0.001); face.position.set(s * 0.008, 0.15, -0.03); vice.add(face); }
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.2, 10), M.iron({ color: '#7a7e82', roughness: 0.4 })); screw.rotation.z = Math.PI / 2; screw.position.set(0.1, 0.14, -0.03); vice.add(screw);
    const tbar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), M.iron({ color: '#7a7e82', roughness: 0.4 })); tbar.position.set(0.2, 0.14, -0.03); tbar.rotation.x = 0.4; vice.add(tbar);
    // the blank, in the jaws (hidden until it goes in)
    const key = this._keyMesh({ len: 0.18 });
    key.position.set(2.3, BENCH.top + 0.175, 0.08); key.visible = false; G.add(key);
    this.key = key;
    this.keyHome = { position: key.position.clone(), rotation: new THREE.Euler(0, 0, 0) };
    this.cuts = ctx.state.get('nursery.cuts', [3, 3, 3, 3, 3]).slice();
    this._applyCuts(false);
    // the mock front door: the foyer's door, three feet tall, standing on the bench against the wall
    const mock = new THREE.Group(); mock.position.set(W / 2 - 0.12, BENCH.top, 0.62); mock.rotation.y = -Math.PI / 2; G.add(mock);
    const dw = 0.46, dh = 0.78;
    const wood = M.walnut({ tint: '#2e1e16' });
    for (const s of [-1, 1]) { const post = F.rbox(0.05, dh + 0.18, 0.07, wood, 0.006); post.position.set(s * (dw / 2 + 0.025), (dh + 0.18) / 2, 0); mock.add(post); }
    const head = F.rbox(dw + 0.1, 0.05, 0.07, wood, 0.006); head.position.set(0, dh + 0.18 + 0.025, 0); mock.add(head);
    const sill = F.rbox(dw + 0.14, 0.03, 0.1, M.smoothStone({ color: '#8a8278' }), 0.006); sill.position.set(0, 0.015, 0.02); mock.add(sill);
    const voidM = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh + 0.18), M.matte('#050302')); voidM.position.set(0, (dh + 0.18) / 2, -0.03); mock.add(voidM);
    // the fanlight, the house's name leaded into it, the wrong way round from in here
    const fan = makeCanvasPlane(dw, 0.16, (g, w, h) => drawFanlight(g, w, h), { px: 256, emissive: true, transparent: true });
    fan.position.set(0, dh + 0.09, -0.01); mock.add(fan);
    const fanBar = new THREE.Mesh(new THREE.RingGeometry(dw / 2 - 0.02, dw / 2, 20, 1, 0, Math.PI), wood); fanBar.position.set(0, dh + 0.01, 0); mock.add(fanBar);
    const hinge = new THREE.Group(); hinge.position.set(-dw / 2, 0, 0); mock.add(hinge);
    const leaf = new THREE.Group(); leaf.position.set(dw / 2, 0, 0); hinge.add(leaf);
    const dark = M.wood({ tint: '#3a2418', seed: 4, roughness: 0.7 });
    for (let i = 0; i < 5; i++) { const p = F.rbox(dw / 5 - 0.003, dh - 0.03, 0.05, dark, 0.004); p.position.set(-dw / 2 + (dw / 5) * (i + 0.5), 0.015 + (dh - 0.03) / 2, 0); leaf.add(p); }
    for (const y of [0.18, 0.56]) { const r = F.rbox(dw - 0.04, 0.03, 0.01, M.walnut({ tint: '#241510' }), 0.003); r.position.set(0, y, 0.03); leaf.add(r); }
    const knocker = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16), M.brass()); knocker.position.set(0, 0.5, 0.035); leaf.add(knocker);
    const kplate = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 12), M.brass()); kplate.rotation.x = Math.PI / 2; kplate.position.set(0, 0.52, 0.03); leaf.add(kplate);
    const esc = F.rbox(0.04, 0.075, 0.008, M.brass(), 0.003); esc.position.set(0.14, 0.4, 0.03); leaf.add(esc);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.007, 12), M.matte('#050302')); hole.position.set(0.14, 0.415, 0.035); leaf.add(hole);
    const slot = F.rbox(0.005, 0.02, 0.002, M.matte('#050302'), 0.0005); slot.position.set(0.14, 0.4, 0.035); leaf.add(slot);
    const doorknob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), M.brass()); doorknob.position.set(0.14, 0.34, 0.045); leaf.add(doorknob);
    const keyholeW = () => leaf.localToWorld(new THREE.Vector3(0.14, 0.41, 0.03));
    const kproxy = this._proxy(0.09, 0.12, 0.1, [0.14, 0.4, 0.04], leaf);
    this.mock = { group: mock, hinge, leaf, keyholeW, esc };
    this._cutting = false;
    // poses and the shared pieces
    const focus = async () => {
      await ctx.camera.focus({ position: [1.68, 1.13, -0.14], lookAt: [2.38, 0.92, 0.32], scope: 'focus:nursery.mock', fov: 42, onExit: () => { this.house.blurLock(); this._endCutting(); } });
      if (this._inScope('focus:nursery.mock')) this.house.focusLock('mock', { onOpen, after });
    };
    const onOpen = async () => {
      if (this._cutting) await this._keyToDoor();
      ctx.audio.play('keyTurn', { gain: 0.6, pitch: 1.4 });
      if (this._cutting) await ctx.tween.to(key.rotation, { z: TAU * 0.5 }, { duration: 0.6, ease: 'inOutSine' });
      ctx.audio.play('unlock', { gain: 0.7, pitch: 1.6 });
      await ctx.tween.delay(0.25);
      ctx.audio.play('doorOpen', { gain: 0.5, pitch: 1.5 });
      await ctx.tween.to(hinge.rotation, { y: 1.25 }, { duration: 1.2, ease: 'outCubic' });
      this._cutting = false; key.visible = false;
    };
    const after = () => this._afterMock();
    const force = () => { if (!this.house.isOpen('mock')) this.house.open('mock', 'force', { onOpen, after }); };
    const startCutting = async () => {
      if (this.house.isOpen('mock')) return;
      if (!this.house.has('blank')) { ctx.audio.play('error', { gain: 0.4 }); return ctx.dialogue.say('react.mock.noblank'); }
      if (!ctx.camera.inFocus || ctx.camera.scope !== 'focus:nursery.mock') await focus();
      if (this._cutting || this.house.isOpen('mock') || !this._inScope('focus:nursery.mock')) return;
      this._cutting = true;
      ctx.audio.play('ratchet', { gain: 0.4, pitch: 0.9 });
      key.position.copy(this.keyHome.position); key.rotation.copy(this.keyHome.rotation);
      key.visible = true; key.scale.setScalar(0.01);
      await ctx.tween.to(key.scale, { x: 1, y: 1, z: 1 }, { duration: 0.35, ease: 'outBack' });
    };
    const tryKey = () => this._tryKey(() => this.house.open('mock', 'pick', { onOpen, after }));
    this._hs({
      id: 'nursery.mock', object: leaf, label: () => (this.house.isOpen('mock') ? 'The little door, open' : 'Mock front door'), scope: ['room', 'focus:nursery.mock'],
      onClick: () => {
        if (this.house.isOpen('mock')) return ctx.dialogue.caption('caption.mock.open');
        if (ctx.camera.inFocus && ctx.camera.scope === 'focus:nursery.mock') return this._cutting ? tryKey() : startCutting();
        return focus();
      },
      useItem: { blank: startCutting, bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    this._hs({
      id: 'nursery.mock.keyhole', object: kproxy, label: () => (this._cutting ? 'Try the key' : 'Keyhole'), scope: 'focus:nursery.mock', highlight: esc,
      enabled: () => !this.house.isOpen('mock'),
      onClick: () => (this._cutting ? tryKey() : startCutting()),
      useItem: { blank: startCutting, bonekey: force },
    });
    key.userData.bits.forEach((b, i) => {
      const proxy = ctx.hotspots.proxyBox(0.028, 0.09, 0.022); proxy.position.set(0, 0.03, b.position.z); key.add(proxy);
      this._hs({
        id: `nursery.mock.cut${i}`, object: proxy, label: () => `Position ${i + 1}: ${['', 'one', 'two', 'three'][this.cuts[i]]}`, scope: 'focus:nursery.mock', highlight: b,
        enabled: () => this._cutting && !this.house.isOpen('mock') && !this._keyBusy,
        onClick: () => this._cut(i),
      });
    });
    const kp = this._proxy(0.05, 0.05, 0.09, [0, 0, -0.08], key);
    this._hs({ id: 'nursery.key', object: kp, label: 'Try the key', scope: 'focus:nursery.mock', enabled: () => this._cutting && !this.house.isOpen('mock') && !this._keyBusy, onClick: () => tryKey() });
    // the whole mock door, frame and fanlight, from the room: same as the leaf (the blank on the frame used to miss)
    const mockHs = this.ctx.hotspots.get('nursery.mock');
    const fproxy = this._proxy(dw + 0.16, dh + 0.24, 0.06, [0, (dh + 0.24) / 2, 0.0], mock);
    this._hs({ ...mockHs, id: 'nursery.mock.frame', object: fproxy, scope: 'room', highlight: false });
    // the vice and the bench, from the room: the blank goes into the vice, which is the mock door's close-up
    const viceUse = () => {
      if (this.house.isOpen('mock')) return ctx.dialogue.caption(this.house.verb('mock') === 'pick' ? 'caption.vice.done' : 'caption.vice');
      return this.house.has('blank') ? startCutting() : ctx.dialogue.caption('caption.vice');
    };
    const vproxy = this._proxy(0.42, 0.42, 0.42, [2.3, BENCH.top + 0.15, 0.1]);
    this._hs({
      id: 'nursery.vice', object: vproxy, label: 'The vice', scope: 'room', highlight: false, onClick: viceUse,
      useItem: { blank: () => (this.house.isOpen('mock') ? ctx.dialogue.caption('caption.vice.done') : startCutting()), bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    const bproxy = this._proxy(BENCH.depth + 0.04, BENCH.top, BENCH.len + 0.04, [BENCH.x, BENCH.top / 2, BENCH.z]);
    this._hs({
      id: 'nursery.benchtop', object: bproxy, label: 'His bench', scope: 'room', highlight: false, onClick: viceUse,
      useItem: { blank: () => (this.house.isOpen('mock') ? ctx.dialogue.caption('caption.vice.done') : startCutting()), bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') },
    });
  }

  _applyCuts(animated) {
    const { ctx } = this;
    this.key.userData.bits.forEach((b, i) => {
      const y = this.cuts[i] * this.key.userData.step;
      if (animated) ctx.tween.to(b.scale, { y }, { duration: 0.25, ease: 'outQuad' }); else b.scale.y = y;
    });
  }
  _cut(i) {
    const { ctx } = this;
    this.cuts[i] = this.cuts[i] === 1 ? 3 : this.cuts[i] - 1;
    const wasFiled = blankFiled();
    ctx.state.set('nursery.cuts', this.cuts.slice());
    if (blankFiled() !== wasFiled) ctx.inventory.render(); // the slot's label: "A key blank" / "The filed key"
    ctx.audio.play('ratchet', { gain: 0.5, pitch: 1.5 + i * 0.08 });
    this._applyCuts(true);
    const b = this.key.userData.bits[i]; const p = b.getWorldPosition(new THREE.Vector3());
    P.burst(ctx, this.group, [p.x, p.y + 0.03, p.z], { color: '#f0e0a0', color2: '#8a7a40', count: 8, radius: 0.08, duration: 0.8, size: 0.01 });
  }
  async _keyToDoor() {
    const { ctx } = this;
    const k = this.mock.keyholeW();
    ctx.audio.play('click', { gain: 0.4 });
    await ctx.tween.to(this.key.position, { x: k.x - 0.1, y: k.y - 0.01, z: k.z }, { duration: 0.7, ease: 'inOutSine' });
    await ctx.tween.to(this.key.rotation, { y: Math.PI / 2 }, { duration: 0.3, ease: 'inOutSine' });
    await ctx.tween.to(this.key.position, { x: k.x - 0.06 }, { duration: 0.35, ease: 'inQuad' });
  }
  async _tryKey(solved) {
    const { ctx } = this;
    if (!this._cutting || this._keyBusy || this.house.isOpen('mock')) return;
    if (this.cuts.every((c, i) => c === CUT_SOLUTION[i])) { solved(); return; }
    this._keyBusy = true;
    ctx.hotspots.lock();
    try {
      await this._keyToDoor();
      ctx.audio.play('error', { gain: 0.45, pitch: 0.8 });
      ctx.camera.shake(0.004, 0.2);
      await ctx.tween.to(this.key.rotation, { z: 0.25 }, { duration: 0.18, ease: 'outQuad' });
      await ctx.tween.to(this.key.rotation, { z: 0 }, { duration: 0.18, ease: 'inOutSine' });
      await ctx.dialogue.say('react.mock.wrong');
      // filed past the drawing somewhere: he looks up after all, once, and gives you a fresh blank (the cuts start over)
      const over = this.cuts.some((c, i) => c < CUT_SOLUTION[i]);
      if (over && !ctx.state.get('nursery.blank.spare') && this._wickHere()) {
        ctx.state.set('nursery.blank.spare', true);
        this._wickFigure().userData.lookAt(ctx.camera.camera.position.clone(), 6);
        await ctx.dialogue.say('react.wick.blank');
        this.cuts = [3, 3, 3, 3, 3];
        ctx.state.set('nursery.cuts', this.cuts.slice());
        ctx.inventory.render(); // "The filed key" is a blank again
        ctx.audio.play('drop', { gain: 0.35, pitch: 1.6 });
        this._applyCuts(true);
      }
      await ctx.tween.to(this.key.position, { x: this.keyHome.position.x + 0.05, y: this.keyHome.position.y + 0.06, z: this.keyHome.position.z }, { duration: 0.6, ease: 'inOutSine' });
      await ctx.tween.to(this.key.rotation, { y: 0 }, { duration: 0.3, ease: 'inOutSine' });
      await ctx.tween.to(this.key.position, { x: this.keyHome.position.x, y: this.keyHome.position.y }, { duration: 0.3, ease: 'outQuad' });
    } finally { ctx.hotspots.unlock(); this._keyBusy = false; }
  }
  _endCutting() {
    if (!this._cutting) return;
    this._cutting = false;
    this.key.visible = false;
    this.key.position.copy(this.keyHome.position); this.key.rotation.copy(this.keyHome.rotation);
  }

  /** After the mock door opens, by any verb: he puts the pick down, asks for the lantern if you still carry it and he
   *  never has, then asks about the cellar. */
  async _afterMock() {
    const { ctx } = this;
    if (ctx.state.get('nursery.wick.asked') || this.house.wickDown || !this._wickHere()) {
      if (this._wantsToAsk()) await this._lanternChoice();
      return;
    }
    ctx.state.set('nursery.wick.asked', true);
    ctx.hotspots.lock();
    try {
      ctx.camera.lookAtPoint(new THREE.Vector3(WICK.pos[0], 1.05, WICK.pos[2]));
      this.wick.userData.lookAt(ctx.camera.camera.position.clone(), 12);
      await ctx.tween.delay(0.7);
      if (this._wantsToAsk()) await this._lanternChoice();
      const idx = await ctx.dialogue.choice('choice.wick.down');
      if (idx === 0) {
        this.house.bringWickDown();
        await this._wickStand();
        await ctx.dialogue.say('react.wick.down');
      } else {
        await ctx.dialogue.say('react.wick.stays');
      }
    } finally { ctx.hotspots.unlock(); }
  }
  async _wickStand() {
    const { ctx } = this;
    ctx.audio.play('bookSlide', { gain: 0.45, pitch: 0.55 });
    const p = new THREE.Vector3(WICK.pos[0], 0.9, WICK.pos[2]);
    P.burst(ctx, this.group, p.toArray(), { color: '#d9d0b0', color2: '#6a6050', count: 14, radius: 0.5, duration: 1.6, size: 0.02 });
    this.wick.visible = false;
    this.wickUp.position.set(WICK.pos[0] - 0.35, 0, WICK.pos[2] + 0.25); this.wickUp.rotation.y = 0.35; this.wickUp.visible = true;
    this.wickUp.userData.lookAt(ctx.camera.camera.position.clone(), 8);
    await ctx.tween.delay(0.4);
  }
  _wickHere() { return this.wick.visible || this.wickUp.visible; }
  _wickFigure() { return this.wick.visible ? this.wick : this.wickUp; }

  // ───────────────────────────────────────────────── Mr. Wick
  _buildWick() {
    const G = this.group, { ctx } = this;
    const wick = makeFigure({ kind: 'wick' }); wick.position.set(...WICK.pos); wick.rotation.y = WICK.yaw; G.add(wick);
    const up = makeFigure({ kind: 'wick', pose: 'standing' }); up.position.set(WICK.pos[0] - 0.35, 0, WICK.pos[2] + 0.25); up.rotation.y = 0.35; up.visible = false; G.add(up);
    this.wick = wick; this.wickUp = up;
    const spec = (id, obj) => this._hs({
      id, object: obj, label: 'Mr. Wick', enabled: () => obj.visible,
      onClick: () => (this._wantsToAsk() ? this._lanternChoice() : ctx.hints.ask()),
      useItem: {
        lantern: () => this._lanternChoice(),
        bonekey: () => { obj.userData.lookAt(ctx.camera.camera.position.clone(), 4); ctx.dialogue.say([{ who: 'wick', text: 'Nine. Count them again at the door; it will.' }]); },
        blank: () => { obj.userData.lookAt(ctx.camera.camera.position.clone(), 4); ctx.dialogue.say([{ who: 'wick', text: 'That is the right blank. It is not the right key yet. The vice is there.' }]); },
        '*': () => ctx.dialogue.caption('caption.nope'),
      },
    });
    spec('nursery.wick', wick); spec('nursery.wick.up', up);
  }
  /** He asks for the lantern himself, once, on any path: on the first click while it is carried, and at the latest when the
   *  mock door opens (like Mr. Finch). */
  _wantsToAsk() { return this.house.lantern === 'carried' && this._wickHere() && !this.ctx.state.get('nursery.wick.lantern.asked'); }
  async _lanternChoice() {
    const { ctx } = this;
    if (this.house.lantern !== 'carried') return;
    ctx.state.set('nursery.wick.lantern.asked', true);
    const fig = this._wickFigure();
    fig.userData.lookAt(ctx.camera.camera.position.clone(), 8);
    const idx = await ctx.dialogue.choice('choice.wick.lantern');
    if (idx !== 0) { await ctx.dialogue.say('react.wick.lantern.kept'); return; }
    this.house.giveLantern('wick');
    ctx.audio.play('drop', { gain: 0.6 });
    this.benchLantern.visible = true;
    this._carried.set(false);
    this._syncDolls(true);
    if (ctx.state.get('hint.mock.level', 0) < 2) ctx.state.set('hint.mock.level', 2); // he has said it outright; the next ask repeats the cuts
    await ctx.dialogue.say('react.wick.lantern.given');
  }
  onHintAsked() {
    const st = this.ctx.state;
    this._wickFigure().userData.lookAt(this.ctx.camera.camera.position.clone(), 5);
    // past level 3 the engine alternates an idle line with the answer; up here the answer is what was asked for
    for (const id of Nursery.puzzleOrder) if (st.get(`hint.${id}.level`, 0) > 2) st.set(`hint.${id}.level`, 2);
  }
  /** Without the lantern, hints 1-2 for the dolls point at the moon instead; from the first of them the figures show, close to. */
  hintVariant(id) {
    if (id !== 'dolls' || this.lit) return null;
    if (!this.ctx.state.get('nursery.dolls.moon')) { this.ctx.state.set('nursery.dolls.moon', true); this._syncDolls(true); }
    return 'dark';
  }

  // ───────────────────────────────────────────────── Mrs. Tallow, if she is sent for, or when the house calls
  _buildTallow() {
    const { ctx } = this;
    const fig = makeFigure({ kind: 'tallow' });
    fig.position.set(...TALLOW_DOOR.pos); fig.rotation.y = TALLOW_DOOR.yaw; fig.visible = false; this.group.add(fig);
    this.tallow = fig;
    this._hs({
      id: 'nursery.tallow', object: fig, label: 'Mrs. Tallow', enabled: () => fig.visible,
      onClick: () => { fig.userData.lookAt(ctx.camera.camera.position.clone(), 4); ctx.dialogue.say([{ who: 'tallow', text: ctx.script['caption.tallow.wick'] }]); },
      useItem: { lantern: () => { ctx.dialogue.say([{ who: 'tallow', text: 'It was left for you, not for me. Keep it.' }]); return false; }, '*': () => ctx.dialogue.caption('caption.nope') },
    });
  }
  async tallowTo(lockId) {
    const s = TALLOW_SPOTS[lockId]; if (!s) return;
    this.ctx.state.set('nursery.tallow.at', lockId);
    if (!this.tallow.visible) { this.tallow.position.set(...TALLOW_DOOR.pos); this.tallow.rotation.y = TALLOW_DOOR.yaw; this.tallow.visible = true; this.ctx.state.set('nursery.tallow.here', true); }
    await this.tallow.userData.walkTo(this.ctx, s.pos, { faceYaw: s.yaw, speed: 1.3 });
  }
  /** Is she already standing in here (for the ring line: "again", not "on my way")? */
  tallowHere() { return this.tallow.visible; }
  _inScope(scope) { return this.ctx.camera.inFocus && this.ctx.camera.scope === scope; }
  /** The house has called: she is simply beside you, before she speaks. */
  onCall() {
    this._placeTallowCalled();
    this.tallow.userData.lookAt(this.ctx.camera.camera.position.clone(), 6);
  }
  /** After her line: Mr. Wick, if he is coming down, goes ahead. */
  async afterCall() {
    const { ctx } = this;
    if (this.house.wickDown && this.wickUp.visible) {
      await ctx.tween.delay(0.4);
      await this.wickUp.userData.walkTo(ctx, [DOOR.x + 0.1, 0, D / 2 - 0.3], { speed: 0.8 });
      await this.wickUp.userData.walkTo(ctx, [DOOR.x, 0, D / 2 + 0.6], { speed: 0.8 });
      this.wickUp.visible = false;
    }
  }
  _placeTallowCalled() { this.tallow.position.set(...TALLOW_CALLED.pos); this.tallow.rotation.y = TALLOW_CALLED.yaw; this.tallow.visible = true; }

  // ───────────────────────────────────────────────── dressing: rug, pendant, shelf, webs, dust
  _buildDressing() {
    const S = this.statics, G = this.group;
    const rug = F.rug({ w: 1.7, d: 2.3, base: '#6a6658', accent: '#a89078', dark: '#3a3630' }); rug.position.set(0.1, 0.004, 0.2); S.add(rug);
    // a pendant lamp, unlit, on a cord
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 6), M.matte('#2a2622')); cord.position.set(0.2, H - 0.3, -0.2); S.add(cord);
    const pend = F.lathe([[0.02, 0], [0.12, 0.12], [0.17, 0.2], [0.18, 0.21], [0.0, 0.21]], M.glass({ color: '#e8e0d0', opacity: 0.5 }), 20); pend.position.set(0.2, H - 0.8, -0.2); pend.renderOrder = 3; G.add(pend);
    const pbulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.matte('#d8d0c0', { roughness: 0.3 })); pbulb.position.set(0.2, H - 0.72, -0.2); S.add(pbulb);
    // a shelf over the bed with blocks and a tin drum
    const shelf = F.wallShelf({ w: 1.1, d: 0.2, material: M.oak({ tint: '#7a5a38' }) }); shelf.position.set(-W / 2 + 0.11, 1.7, -1.3); shelf.rotation.y = Math.PI / 2; S.add(shelf);
    const cols = ['#8a3a3a', '#3a5a8a', '#8a7a3a', '#3a6a4a'];
    for (let i = 0; i < 5; i++) { const b = F.rbox(0.07, 0.07, 0.07, M.matte(cols[i % 4], { roughness: 0.8 }), 0.006); b.position.set(-W / 2 + 0.11, 1.735 + (i === 4 ? 0.07 : 0), -1.65 + (i === 4 ? 0.07 : i * 0.09)); b.rotation.y = i * 0.3; S.add(b); }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16), M.matte('#8a2a2a', { roughness: 0.6 })); drum.position.set(-W / 2 + 0.11, 1.74, -0.95); S.add(drum);
    const drumTop = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.01, 16), M.matte('#e8dcc0')); drumTop.position.set(-W / 2 + 0.11, 1.785, -0.95); S.add(drumTop);
    for (const [x, z, ry] of [[-W / 2 + 0.02, -D / 2 + 0.02, 0], [W / 2 - 0.02, -D / 2 + 0.02, -Math.PI / 2], [W / 2 - 0.02, D / 2 - 0.02, Math.PI]]) { const web = cobweb({ size: 0.6 }); web.position.set(x, H - 0.02, z); web.rotation.y = ry; G.add(web); }
    G.add(P.dustMotes({ box: [5, 2.6, 4.6], center: [0, 1.4, 0], count: 220, color: '#d8ccb0', size: 0.015, opacity: 0.38 }));
  }

  // ───────────────────────────────────────────────── restore / lifecycle
  _restore() {
    const h = this.house, st = this.ctx.state;
    const pattern = st.get('nursery.shutters', null);
    if (h.isOpen('dolls')) {
      DOLLS_SOLUTION.forEach((v, i) => this._setShutter(i, v, false));
      this.dolls.pivot.rotation.y = DOLLS.openAngle; this.dolls.innerLight.intensity = 0.22;
    } else if (pattern) pattern.forEach((v, i) => this._setShutter(i, !!v, false));
    if (h.s.items.blank !== 'away') this.dolls.blank.visible = false;
    if (h.isOpen('mock')) { this.mock.hinge.rotation.y = 1.25; this.key.visible = false; }
    if (h.lanternWith === 'wick') this.benchLantern.visible = true;
    const w = h.residents().wick;
    if (w.place === 'cellar') { this.wick.visible = false; this.wickUp.visible = false; }
    else if (h.wickDown) { this.wick.visible = false; this.wickUp.visible = true; }
    if (h.called && !h.up) this._placeTallowCalled();
    else if (st.get('nursery.tallow.here')) {
      const at = TALLOW_SPOTS[st.get('nursery.tallow.at')] || TALLOW_SPOTS.dolls;
      this.tallow.visible = true; this.tallow.position.set(...at.pos); this.tallow.rotation.y = at.yaw;
    }
    this._syncDolls(false);
  }

  enter() {
    const { ctx } = this;
    this._leaving = false;
    this._carried.set(this.lit);
    this._syncDolls(false);
    ctx.audio.setClockRunning?.(this.house.s.clock > 0);
    if (!ctx.state.get('nursery.intro.seen') && this._wickHere()) {
      const intro = async () => {
        if (ctx.game.currentRoom !== this || ctx.state.get('nursery.intro.seen')) return;
        if (ctx.camera.inFocus || ctx.dialogue.isOpen || ctx.dialogue.busy) { this._timers.push(setTimeout(intro, 2500)); return; } // not over a close-up or a line
        ctx.state.set('nursery.intro.seen', true);
        this._wickFigure().userData.lookAt(ctx.camera.camera.position.clone(), 10);
        await ctx.dialogue.say('nursery.intro');
      };
      this._timers.push(setTimeout(intro, 2500));
    }
  }
  enterTitle() { this._carried.set(false); }
  exit() { for (const t of this._timers) clearTimeout(t); this._timers = []; this._carried.set(false); this._endCutting(); }

  update(dt, t) {
    this._carried.update(dt, t);
    // the hazards on the van, through the window
    const on = (t % 1.3) < 0.55;
    if (on !== this._hz) { this._hz = on; for (const m of this.hazards) m.visible = on; this.hazardLight.intensity = on ? 0.5 : 0; }
    if (this.lit !== this._wasLit) { this._wasLit = this.lit; this._syncDolls(true); }
  }
}

// ───────────────────────────────────────────────── textures and drawings
/** Lamb wallpaper: a cream gone the colour of tea, little lambs in rows, damp at the edges. */
function lambWallpaper() {
  const size = 512, c = makeCanvas(size, size), g = c.getContext('2d'), r = rng(19);
  g.fillStyle = '#cfc3a2'; g.fillRect(0, 0, size, size);
  // faint stripes
  for (let x = 0; x < size; x += 32) { g.fillStyle = (x / 32) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'; g.fillRect(x, 0, 32, size); }
  const lamb = (cx, cy, s, flip) => {
    g.save(); g.translate(cx, cy); if (flip) g.scale(-1, 1);
    g.fillStyle = '#ece4cf';
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; g.beginPath(); g.arc(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.55, s * 0.36, 0, TAU); g.fill(); }
    g.beginPath(); g.ellipse(0, 0, s, s * 0.65, 0, 0, TAU); g.fill();
    g.strokeStyle = '#3a342c'; g.lineWidth = Math.max(1.5, s * 0.1); g.lineCap = 'round';
    for (const lx of [-0.55, -0.25, 0.25, 0.55]) { g.beginPath(); g.moveTo(lx * s, s * 0.5); g.lineTo(lx * s + s * 0.05, s * 1.15); g.stroke(); }
    g.fillStyle = '#3a342c'; g.beginPath(); g.ellipse(s * 1.05, -s * 0.35, s * 0.3, s * 0.38, 0.3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(s * 0.85, -s * 0.6, s * 0.14, s * 0.08, -0.6, 0, TAU); g.fill();
    g.fillStyle = '#ece4cf'; g.beginPath(); g.arc(s * 1.12, -s * 0.42, s * 0.05, 0, TAU); g.fill();
    g.restore();
  };
  const cell = size / 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = x * cell + cell / 2 + ((y % 2) ? cell / 2 : 0), cy = y * cell + cell / 2;
    lamb(cx % size, cy, cell * 0.17, (x + y) % 2 === 0);
    if (cx > size - cell / 2) lamb(cx - size, cy, cell * 0.17, (x + y) % 2 === 0);
  }
  for (let i = 0; i < 5; i++) {
    const sx = r() * size, sy = r() * size;
    const gr = g.createRadialGradient(sx, sy, 0, sx, sy, size * (0.12 + r() * 0.22));
    gr.addColorStop(0, 'rgba(90,60,30,0.32)'); gr.addColorStop(1, 'rgba(90,60,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const t = canvasTexture(c, { repeat: [1, 1] }); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The doll's house front: brick, a cream band, the door surround. The windows and door are geometry on top. */
function drawFacade(g, w, h) {
  const r = rng(3);
  g.fillStyle = '#7a4a3c'; g.fillRect(0, 0, w, h);
  const bh = h / 26, bw = w / 9;
  for (let y = 0; y < 26; y++) for (let x = -1; x < 10; x++) {
    const off = (y % 2) ? bw / 2 : 0;
    g.fillStyle = `rgb(${110 + r() * 30},${62 + r() * 20},${48 + r() * 16})`;
    g.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, bh - 2);
  }
  g.fillStyle = '#d9d0b4'; g.fillRect(0, h * 0.0, w, h * 0.035); g.fillRect(0, h * 0.72, w, h * 0.02);
  g.fillStyle = '#d9d0b4'; g.fillRect(w * 0.36, h * 0.66, w * 0.28, h * 0.34);
  g.fillStyle = 'rgba(40,20,10,0.25)'; g.fillRect(0, h * 0.93, w, h * 0.07);
}

/** Somebody at a little window: a pale head and shoulders, not quite a face. */
function drawFigure(g, w, h, seed) {
  const r = rng(100 + seed);
  g.clearRect(0, 0, w, h);
  const cx = w * (0.4 + r() * 0.2), hy = h * 0.38, hr = w * 0.17;
  const gr = g.createRadialGradient(cx, h * 0.6, 0, cx, h * 0.6, w * 0.6);
  gr.addColorStop(0, 'rgba(255,236,190,0.55)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(28,22,18,0.95)';
  g.beginPath(); g.arc(cx, hy, hr, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx, h * 0.9, w * 0.34, h * 0.36, 0, Math.PI, TAU); g.fill();
  g.fillStyle = 'rgba(255,236,190,0.35)'; g.beginPath(); g.arc(cx - hr * 0.3, hy - hr * 0.2, hr * 0.12, 0, TAU); g.fill(); g.beginPath(); g.arc(cx + hr * 0.3, hy - hr * 0.2, hr * 0.12, 0, TAU); g.fill();
}

/** The street below the window, from the first floor: the far terrace, the road, the lamp, your van at the kerb. */
function drawStreet(g, w, h) {
  const r = rng(44);
  g.clearRect(0, 0, w, h);
  // the far terrace: black roofs against the sky, one window lit
  g.fillStyle = '#05060b'; g.fillRect(0, h * 0.1, w, h * 0.22);
  g.fillStyle = '#030408'; for (let i = 0; i < 6; i++) g.fillRect(w * (i * 0.17 - 0.02), h * 0.06, w * 0.15, h * 0.06);
  g.fillStyle = '#0a0c14'; for (let i = 0; i < 6; i++) g.fillRect(w * (0.05 + i * 0.16), h * 0.2, w * 0.05, h * 0.07);
  g.fillStyle = '#5a4a28'; g.fillRect(w * 0.69, h * 0.2, w * 0.05, h * 0.07);
  // the road, wet; the near pavement and its kerb
  g.fillStyle = '#171a22'; g.fillRect(0, h * 0.32, w, h * 0.68);
  g.fillStyle = '#22252d'; g.fillRect(0, h * 0.8, w, h * 0.2);
  g.fillStyle = '#3a3c44'; g.fillRect(0, h * 0.79, w, h * 0.012);
  g.fillStyle = 'rgba(190,200,230,0.1)'; for (let i = 0; i < 80; i++) g.fillRect(r() * w, h * (0.32 + r() * 0.68), 2, 1);
  // the lamp: a post up to the window, a head, a cone of sodium light on the road
  const lx = w * 0.74;
  const cone = g.createRadialGradient(lx, h * 0.62, 0, lx, h * 0.62, w * 0.55);
  cone.addColorStop(0, 'rgba(255,190,110,0.55)'); cone.addColorStop(0.5, 'rgba(255,170,90,0.16)'); cone.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = cone; g.fillRect(0, h * 0.3, w, h * 0.7);
  g.fillStyle = '#1e1a16'; g.fillRect(lx - 3, h * 0.0, 6, h * 0.86);
  g.fillStyle = '#ffd9a0'; g.beginPath(); g.ellipse(lx, h * 0.03, 10, 7, 0, 0, TAU); g.fill();
  // the van, nose to the kerb, from above and behind: roof with a ladder, bonnet, windscreen
  g.save(); g.translate(w * 0.33, h * 0.64); g.rotate(-0.22);
  g.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(g, -w * 0.13, -h * 0.13, w * 0.26, h * 0.27, 10); g.fill();
  g.fillStyle = '#d8d2c4'; roundRect(g, -w * 0.12, -h * 0.14, w * 0.24, h * 0.26, 10); g.fill();
  g.fillStyle = '#c0b8a8'; roundRect(g, -w * 0.12, -h * 0.14, w * 0.24, h * 0.06, 8); g.fill();
  g.fillStyle = '#1e2430'; roundRect(g, -w * 0.11, -h * 0.085, w * 0.22, h * 0.035, 6); g.fill();
  g.fillStyle = '#8a8478'; for (let i = 0; i < 2; i++) g.fillRect(-w * 0.07 + i * w * 0.13, -h * 0.04, 4, h * 0.14);
  for (let i = 0; i < 5; i++) g.fillRect(-w * 0.07, -h * 0.03 + i * h * 0.03, w * 0.14, 3);
  g.restore();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** The height marks on the door frame: E., year by year to seven; then, much higher, T.W. 1932. */
function drawMarks(g, w, h) {
  g.fillStyle = '#ddd5bf'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < 40; i++) g.fillRect(0, (i / 40) * h, w, 1);
  const toY = (m) => ((1.8 - m) / 1.7) * h; // the plane runs from 0.1 m to 1.8 m
  g.strokeStyle = 'rgba(50,44,40,0.75)'; g.fillStyle = 'rgba(50,44,40,0.8)'; g.lineWidth = 2;
  g.font = `italic ${Math.round(w * 0.22)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'left';
  const heights = [0.62, 0.7, 0.78, 0.86, 0.95, 1.03, 1.1];
  heights.forEach((m, i) => {
    const y = toY(m);
    g.beginPath(); g.moveTo(w * 0.1, y); g.lineTo(w * 0.62, y + (i % 2 ? 1 : -1)); g.stroke();
    g.save(); g.translate(w * 0.66, y + w * 0.08); g.rotate(-0.05); g.fillText(`E. ${i + 1}`, 0, 0); g.restore();
    g.font = `${Math.round(w * 0.16)}px "Cormorant Garamond", Georgia, serif`; g.fillText(String(1892 + i), w * 0.12, y - 3); g.font = `italic ${Math.round(w * 0.22)}px "Cormorant Garamond", Georgia, serif`;
  });
  // then, much higher, another hand: harder, squarer
  const y = toY(1.62);
  g.strokeStyle = 'rgba(30,26,24,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.06, y); g.lineTo(w * 0.7, y); g.stroke();
  g.fillStyle = 'rgba(30,26,24,0.9)'; g.font = `700 ${Math.round(w * 0.2)}px Inter, sans-serif`; g.fillText('T.W.', w * 0.1, y - 6); g.fillText('1932', w * 0.1, y + w * 0.22);
}

/** His drawing of the front door's key: five teeth in profile, their heights numbered, dated and underlined once, hard. */
function drawChart(g, w, h) {
  const r = rng(32);
  g.fillStyle = '#e4d8b8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,70,40,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 3, 3); }
  g.strokeStyle = 'rgba(40,34,30,0.85)'; g.lineWidth = 2.2; g.lineJoin = 'round';
  // the bow
  g.beginPath(); g.ellipse(w * 0.14, h * 0.5, w * 0.07, h * 0.16, 0, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(w * 0.14, h * 0.5, w * 0.035, h * 0.08, 0, 0, TAU); g.stroke();
  // the shaft and the bit: the top edge steps, 2 3 1 3 2 (3 is the full height)
  const x0 = w * 0.21, x1 = w * 0.9, base = h * 0.6, top = h * 0.56;
  g.beginPath(); g.moveTo(x0, base); g.lineTo(x1, base); g.lineTo(x1, top); g.lineTo(x0 + w * 0.26, top); g.lineTo(x0 + w * 0.26, h * 0.52); g.lineTo(x0, h * 0.52); g.closePath(); g.stroke();
  const bx = x0 + w * 0.3, bw = (x1 - bx) / 5, step = h * 0.085;
  g.beginPath(); g.moveTo(bx, top);
  CUT_SOLUTION.forEach((c, i) => { const y = top - c * step; g.lineTo(bx + i * bw, y); g.lineTo(bx + (i + 1) * bw - 3, y); });
  g.lineTo(x1, top); g.stroke();
  // numbered, with little leader lines
  g.fillStyle = 'rgba(40,34,30,0.9)'; g.font = `700 ${Math.round(h * 0.12)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'center';
  CUT_SOLUTION.forEach((c, i) => { const cx = bx + (i + 0.5) * bw; g.fillText(String(c), cx, h * 0.8); g.strokeStyle = 'rgba(40,34,30,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, h * 0.63); g.lineTo(cx, h * 0.69); g.stroke(); });
  g.font = `italic ${Math.round(h * 0.08)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'left'; g.fillText('the front door, from the outside', w * 0.06, h * 0.15);
  g.font = `700 ${Math.round(h * 0.1)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'right'; g.fillText('1932', w * 0.93, h * 0.95);
  g.strokeStyle = 'rgba(40,34,30,0.95)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.76, h * 0.97); g.lineTo(w * 0.94, h * 0.975); g.stroke();
}

/** The little fanlight over the mock door: the name leaded in, the wrong way round from in here. */
function drawFanlight(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#0c1226'; g.beginPath(); g.ellipse(w / 2, h, w / 2, h, 0, Math.PI, TAU); g.fill();
  g.strokeStyle = '#3a3a40'; g.lineWidth = 3;
  for (let i = 1; i < 4; i++) { const a = Math.PI + (Math.PI * i) / 4; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2 + Math.cos(a) * w / 2, h + Math.sin(a) * h); g.stroke(); }
  g.save(); g.translate(w / 2, h * 0.8); g.scale(-1, 1);
  g.fillStyle = '#c8b870'; g.font = `700 ${Math.round(h * 0.42)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'center'; g.fillText('ROOK', 0, 0); g.restore();
}
