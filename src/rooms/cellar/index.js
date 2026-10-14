// THE CELLAR (`cellar`) and the settling. See docs/GAME.md §7, §9.
//
// Layout (metres, floor centre origin, north = −Z; the player stands at the stair foot, south-east, facing north):
//   north (−Z): the memorial wall: three resident plates, one plate per previous night, a blank plate with tonight's date;
//               the residents who came down stand under their plates (Wick left, Pell centre; Finch never)
//   west  (−X): the furnace, the only light; the coal scuttle
//   east  (+X): the key cabinet between shelves of the house's ledgers, one a year
//   centre:     the table, the ledger open at your page, the bell; Mrs. Tallow on the far side
//   south (+Z): the stair up to the baize door, behind the player
// Lock: cabinet (three flip counters, 8 3 7). The settling: items on the ledger pay favours (into the furnace); the
// ledger with nothing selected is her offer; keys go to their owners; the stair is the checkpoint, then `midnight`.
import * as THREE from 'three';
import { Room } from '../../engine/Room.js';
import * as M from '../../engine/props/materials.js';
import * as F from '../../engine/props/furniture.js';
import * as P from '../../engine/props/particles.js';
import * as L from '../../engine/props/lights.js';
import { makeCanvasPlane } from '../../engine/props/text.js';
import { rng, noiseTexture } from '../../engine/props/textures.js';
import { makeFigure } from '../../engine/props/figure.js';
import { mergeStatic, carriedLight } from '../shared.js';
import { LOCKS, isKey } from '../../logic/house.js';

const TAU = Math.PI * 2;
const W = 7, D = 6.4, H = 2.7;
const SOLUTION = [8, 3, 7];
const OPEN_FLAP = -1.75; // the cabinet's glass door, lifted: a little past level, over the top of the case
const KEYS = { wickkey: { hook: 0, label: 'WICK', teeth: 9 }, pellkey: { hook: 1, label: 'PELL', teeth: 9 }, finchkey: { hook: 2, label: 'FINCH', teeth: 3 } };
const HOOK_X = [-0.33, -0.11, 0.11, 0.33];
const PELL = { pos: [0.3, 0, -2.4], yaw: 0 };
const WICK = { pos: [-1.75, 0, -2.4], yaw: 0 };
const TALLOW = { pos: [0.95, 0, -0.9], yaw: 0.2 };
const RESIDENT_PLATES = [
  { id: 'wick', text: 'T. WICK · No. 88 · 1931 · CAME BACK' },
  { id: 'pell', text: 'D. PELL · No. 203 · 1958 · THIRTY-ONE FAVOURS' },
  { id: 'finch', text: 'A. FINCH · No. 417 · 1974 · THREE TEETH' },
];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** Tonight, in the house's hand: the night is always October 31st; the year is this one. */
export function tonight() { return `31 · ${MONTHS[9]} · ${new Date().getFullYear()}`; }

export default class Cellar extends Room {
  static id = 'cellar';
  static title = 'The Cellar';
  static vantage = { position: [0.6, 1.55, 2.3], lookAt: [1.35, 1.1, -1.4], yawLimit: 180, pitchLimit: 32, fov: 66 }; // the cabinet stays in frame at 800×450
  static puzzleOrder = ['cabinet'];
  /** HUD Back always reads "The stair" down here (the engine hides it during lines and close-ups): the way out is drawn. */
  backLabel = 'The stair';

  async build() {
    const { ctx } = this;
    this.background = new THREE.Color('#070302');
    this.fog = new THREE.FogExp2('#0d0603', 0.04);
    this.envIntensity = 0.3;
    this.exposure = 1.05;
    this.bloom = { strength: 0.5, threshold: 0.75, radius: 0.6 };
    this._timers = [];
    this.statics = new THREE.Group(); this.statics.name = 'statics'; this.group.add(this.statics);
    this.ironM = M.iron({ color: '#2a2724', roughness: 0.7 });
    this.brassM = M.brass();
    this._buildShell();
    this._buildLights();
    this._buildFurnace();
    this._buildWall();
    this._buildEast();
    this._buildTable();
    this._buildStair();
    this._buildPeople();
    this.group.updateMatrixWorld(true);
    mergeStatic(this.statics);
    this._restore();
    this._carried = carriedLight(ctx, this.group);
    this._unsub = this.house.on(() => this._syncBook());
  }

  // ───────────────────────────────────────────────── helpers
  _hs(spec) { return this.ctx.hotspots.add(spec); }
  _proxy(w, h, d, pos, parent = this.group) { const p = this.ctx.hotspots.proxyBox(w, h, d); p.position.set(...pos); parent.add(p); return p; }
  get house() { return this.ctx.house; }
  _cam() { return this.ctx.camera.camera.position.clone(); }

  // ───────────────────────────────────────────────── shell: flags, stone, a low ceiling on beams
  _buildShell() {
    const S = this.statics;
    const flags = M.stone({ tint: '#5a5048', rows: 5, cols: 5, repeat: [4, 3.6], seed: 31, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), flags); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.keep = true; S.add(floor);
    const wall = M.stone({ tint: '#6a5c50', rows: 6, cols: 8, repeat: [5.5, 2.2], seed: 12, roughness: 0.95 });
    const mk = (w, h, pos, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wall); m.position.set(...pos); m.rotation.y = ry; m.receiveShadow = true; m.userData.keep = true; S.add(m); return m; };
    mk(W, H, [0, H / 2, -D / 2], 0);
    mk(D, H, [-W / 2, H / 2, 0], Math.PI / 2);
    mk(D, H, [W / 2, H / 2, 0], -Math.PI / 2);
    // south wall with the stair opening cut out (local x = −world x since it faces north)
    const shape = new THREE.Shape(); shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.closePath();
    const hole = new THREE.Path(); const x0 = 0.35, x1 = 1.65, dh = 2.25; // world x −1.65..−0.35
    hole.moveTo(x0, 0); hole.lineTo(x1, 0); hole.lineTo(x1, dh); hole.lineTo(x0, dh); hole.closePath(); shape.holes.push(hole);
    const south = new THREE.Mesh(new THREE.ShapeGeometry(shape), wall); south.position.set(0, 0, D / 2); south.rotation.y = Math.PI; south.receiveShadow = true; south.userData.keep = true; S.add(south);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.plaster({ tint: '#3a302a', repeat: [3, 3] })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; ceil.userData.keep = true; S.add(ceil);
    const beamM = M.oak({ tint: '#2e2016', planks: 0 });
    for (const z of [-2.2, -0.8, 0.6, 2.0]) { const b = F.rbox(W, 0.16, 0.14, beamM, 0.01); b.position.set(0, H - 0.08, z); S.add(b); }
    // a flagstone near the stair foot: the clock is under it
    const flag = this._proxy(1.2, 0.03, 0.9, [1.3, 0.015, 1.1]);
    this._hs({ id: 'cellar.floor', object: flag, label: 'Flagstones', highlight: false, onClick: () => this.ctx.dialogue.caption('caption.floor') });
    this.group.add(P.dustMotes({ box: [4.6, 2.2, 5.0], center: [-0.7, 1.3, 0], count: 160, color: '#ffb080', size: 0.012, opacity: 0.28 }));
  }

  _buildLights() {
    const G = this.group;
    G.add(L.ambientRig({ sky: '#5a3a24', ground: '#140a06', hemi: 0.32, ambient: '#2a1a12', ambientIntensity: 0.3 }));
    // the furnace: the only light, and it breathes
    this.fire = L.flickerLight({ color: '#ff8a3a', intensity: 16, distance: 13, flicker: 0.22, speed: 1.1, castShadow: true, seed: 4 });
    this.fire.position.set(-2.25, 1.0, -0.3); G.add(this.fire);
    // its glow off the ceiling and the far wall, so the brass reads
    this.glow = L.flickerLight({ color: '#d87a3a', intensity: 3.2, distance: 9, flicker: 0.14, speed: 0.9, seed: 9 });
    this.glow.position.set(0.3, 2.45, -0.6); G.add(this.glow);
    const east = new THREE.PointLight('#d08040', 3.2, 6, 2); east.position.set(2.3, 2.0, 0.1); G.add(east);
    const north = new THREE.PointLight('#d08a48', 2.6, 6, 2); north.position.set(0, 2.3, -2.2); G.add(north);
    // a grey-green nothing down the stair from the hall
    const hall = new THREE.PointLight('#9ab09a', 2.2, 5, 2); hall.position.set(-1.0, 2.3, 4.2); G.add(hall);
  }

  // ───────────────────────────────────────────────── west: the furnace and the scuttle
  _buildFurnace() {
    const S = this.statics, G = this.group, { ctx } = this;
    const iron = this.ironM;
    const f = new THREE.Group(); f.position.set(-W / 2 + 0.5, 0, -0.3); G.add(f);
    const body = F.rbox(0.95, 1.25, 0.85, iron, 0.03); body.position.set(0, 0.68, 0); body.castShadow = true; f.add(body);
    const top = F.lathe([[0.5, 0], [0.48, 0.1], [0.36, 0.22], [0.2, 0.3], [0.14, 0.32], [0, 0.32]], iron, 20); top.position.set(f.position.x, 1.3, f.position.z); S.add(top);
    const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, H - 1.6, 14), iron); flue.position.set(f.position.x, 1.6 + (H - 1.6) / 2, f.position.z); S.add(flue);
    const plinth = F.rbox(1.15, 0.08, 1.05, M.smoothStone({ color: '#4a4440', roughness: 0.9 }), 0.01); plinth.position.set(f.position.x, 0.04, f.position.z); S.add(plinth);
    for (let i = 0; i < 3; i++) { const band = F.rbox(0.03, 1.2, 0.9, M.iron({ color: '#3a3430', roughness: 0.5 }), 0.004); band.position.set(f.position.x + 0.47, 0.68, f.position.z - 0.3 + i * 0.3); S.add(band); }
    // the firebox: a dark mouth with a coal bed that glows, and the door standing ajar
    const mouthW = 0.5, mouthH = 0.42, my = 0.62;
    const mouthBack = new THREE.Mesh(new THREE.PlaneGeometry(mouthW, mouthH), M.matte('#1a0a04')); mouthBack.position.set(0.3, my, 0); mouthBack.rotation.y = Math.PI / 2; f.add(mouthBack);
    const coals = makeCanvasPlane(mouthW - 0.04, mouthH - 0.04, (g, w, h) => drawCoals(g, w, h), { px: 256, emissive: true });
    coals.position.set(0.44, my, 0); coals.rotation.y = Math.PI / 2; coals.material.color.setScalar(2.4); f.add(coals);
    this.coals = coals;
    for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, mouthH, 0.012), M.iron({ color: '#1e1b18' })); bar.position.set(0.476, my, -0.2 + i * 0.13); f.add(bar); }
    const door = new THREE.Group(); door.position.set(0.48, my, -mouthW / 2 - 0.02); door.rotation.y = 1.3; f.add(door);
    const leaf = F.rbox(0.03, mouthH + 0.1, mouthW + 0.08, iron, 0.006); leaf.position.set(0, 0, (mouthW + 0.08) / 2); door.add(leaf);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), this.brassM); handle.position.set(0.03, 0, mouthW - 0.05); handle.rotation.y = Math.PI / 2; door.add(handle);
    const vent = F.rbox(0.025, 0.08, 0.3, M.matte('#120804'), 0.003); vent.position.set(0.02, -0.14, mouthW / 2 + 0.04); door.add(vent);
    this.furnaceMouth = new THREE.Vector3(f.position.x + 0.55, my, f.position.z);
    const emb = P.embers({ origin: [f.position.x + 0.5, my + 0.05, f.position.z], spread: 0.16, rise: 0.9, count: 40, color: '#ff8a3a', color2: '#ffd27a', size: 0.022, opacity: 0.9 }); G.add(emb);
    this.embers = emb;
    this._hs({ id: 'cellar.furnace', object: f, label: 'The furnace', highlight: false, onClick: () => { ctx.dialogue.caption('caption.furnace'); this._flare(0.5); }, useItem: { bonekey: () => ctx.dialogue.say('react.pay.bonekey'), '*': () => ctx.dialogue.say([{ who: 'tallow', text: 'Through the book, if you please. The furnace only takes what has been written down.' }]) } });
    // the coal scuttle: a tilted bucket with a lip, coal in it
    const scuttle = new THREE.Group(); scuttle.position.set(-W / 2 + 0.55, 0, 0.75); scuttle.rotation.y = 0.6; G.add(scuttle);
    const bucket = F.lathe([[0.1, 0], [0.16, 0.02], [0.17, 0.26], [0.19, 0.3], [0.16, 0.3], [0.15, 0.03], [0.09, 0.03]], M.iron({ color: '#3a3632', roughness: 0.6 }), 18); scuttle.add(bucket);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.14, 16, 1, true, 0, Math.PI), M.iron({ color: '#3a3632', roughness: 0.6 })); lip.material.side = THREE.DoubleSide; lip.position.set(0, 0.35, 0); lip.rotation.y = Math.PI / 2; scuttle.add(lip);
    const coal = M.matte('#0c0a0a', { roughness: 0.4 });
    const r = rng(41);
    for (let i = 0; i < 11; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03 + r() * 0.02, 0), coal); c.position.set((r() - 0.5) * 0.2, 0.26 + r() * 0.06, (r() - 0.5) * 0.2); c.rotation.set(r() * 3, r() * 3, r() * 3); scuttle.add(c); }
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03, 0), coal); c.position.set(0.25 + r() * 0.2, 0.02, (r() - 0.5) * 0.3); S.add(c); c.position.add(scuttle.position); }
    this._hs({ id: 'cellar.scuttle', object: scuttle, label: 'Coal scuttle', highlight: bucket, onClick: () => ctx.dialogue.caption('caption.scuttle') });
  }

  /** The furnace takes something: a brief flare, then a little brighter than before. */
  _flare(amount = 1) {
    const { ctx } = this;
    const l = this.fire, base = l.userData.baseIntensity;
    l.userData.baseIntensity = base + 4 * amount; l.userData.setLit(true, 0.08);
    const c = this.coals.material.color, from = c.r;
    ctx.tween.run(0.3, (k) => c.setScalar(from + 1.6 * amount * Math.sin(k * Math.PI))).then(() => c.setScalar(from));
    setTimeout(() => { l.userData.baseIntensity = base + 1.2 * amount; l.userData.setLit(true, 1.6); }, 400);
  }

  // ───────────────────────────────────────────────── north: the memorial wall
  _buildWall() {
    const G = this.group, S = this.statics, { ctx } = this;
    const z = -D / 2 + 0.03;
    // a plaster field behind the plates, framed in oak, so the brass has something to sit on
    const rail = (y) => { const m = F.rbox(5.3, 0.05, 0.06, M.oak({ tint: '#2a1a10' }), 0.006); m.position.set(0, y, z + 0.02); S.add(m); };
    rail(2.67);
    this.plates = [];
    const plate = (text, w, h, x, y, { copperplate = false, id, caption, blank = false } = {}) => {
      const m = makeCanvasPlane(w, h, (g, cw, ch) => drawPlate(g, cw, ch, text, { copperplate, blank }), { px: 1024 });
      m.material.metalness = 0.45; m.material.roughness = 0.4; m.material.emissive = new THREE.Color('#6a4a18'); m.material.emissiveIntensity = 0.5;
      m.position.set(x, y, z + 0.02); G.add(m);
      const back = F.rbox(w + 0.02, h + 0.02, 0.012, this.brassM, 0.003); back.position.set(x, y, z + 0.012); S.add(back);
      this.plates.push({ mesh: m, id, caption });
      // a generous target a little proud of the brass, so the plate is easy to hit from the stair foot
      const hit = this._proxy(w + 0.08, h + 0.08, 0.04, [x, y, z + 0.04]);
      this._hs({ id: `cellar.plate.${id}`, object: hit, highlight: m, label: blank ? 'A blank plate, tonight’s date' : id.startsWith('night') ? 'A plate: one of your nights' : 'Brass plate', scope: ['focus:cellar.wall', 'room'], onClick: () => this._plateClick(m, caption) });
      return m;
    };
    RESIDENT_PLATES.forEach((p, i) => plate(p.text, 1.5, 0.2, -1.75 + i * 1.75, 2.42, { id: p.id, caption: () => ctx.dialogue.caption(`caption.plate.${p.id}`) }));
    // rows two and three: one plate per previous night, then the blank with tonight's date
    const nights = ctx.memorial.nights.slice(-7);
    const slot = (i) => [-1.95 + (i % 4) * 1.3, i < 4 ? 1.97 : 1.68];
    nights.forEach((rec, i) => {
      const [x, y] = slot(i);
      const text = ctx.memorial.plateText(rec);
      plate(text, 1.18, 0.15, x, y, { copperplate: rec.ending === 'tally', id: `night${rec.night}`, caption: () => { const s = ctx.script?.['caption.plate.night'] || ''; ctx.dialogue.caption(`${text.replace(/ · /g, ', ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}. ${s}`, { duration: 7 }); } });
    });
    const [bx, by] = slot(Math.min(7, nights.length));
    plate(tonight(), 1.18, 0.15, bx, by, { id: 'blank', blank: true, caption: () => ctx.dialogue.caption('caption.blank') });
    this._wallPose = { position: [0.0, 1.9, 0.6], lookAt: [0.0, 1.98, -3.2], fov: 58 };
  }
  /** A plate close enough to read (from a little above, over the heads of whoever stands under it), and its line. */
  async _plateClick(mesh, caption) {
    const { ctx } = this;
    const p = mesh.position;
    // square on and a little below (the ceiling is 2.7 and a beam runs 1 m out from the wall): the whole plate in frame
    const dist = Math.max(1.1, (mesh.geometry.parameters?.width ?? 1.5) * 0.85);
    const pose = { position: [p.x, Math.min(p.y - 0.05, 2.2), p.z + dist], lookAt: [p.x, p.y, p.z], fov: 40 };
    if (ctx.camera.inFocus && ctx.camera.scope === 'focus:cellar.wall') await ctx.camera.refocus(pose);
    else await ctx.camera.focus({ ...pose, scope: 'focus:cellar.wall', onExit: () => ctx.dialogue.hideCaption() });
    caption();
  }

  // ───────────────────────────────────────────────── east: the ledgers and the key cabinet
  _buildEast() {
    const S = this.statics, G = this.group, { ctx } = this;
    const x = W / 2 - 0.2;
    const shelfM = M.oak({ tint: '#2e1e12', planks: 0 });
    const colors = ['#3a2a1e', '#2a3328', '#4a2a22', '#26262f', '#514430', '#3b2f2a'];
    for (const [z, seed] of [[-1.9, 3], [2.0, 5]]) {
      const sh = F.bookshelf({ w: 1.25, h: 2.3, d: 0.3, shelves: 5, material: shelfM, fill: 0.95, seed, colors }); sh.position.set(x, 0, z); sh.rotation.y = -Math.PI / 2; S.add(sh);
      const p = this._proxy(1.25, 2.3, 0.44, [0, 1.15, 0.06], sh); p.userData.keep = true;
      this._hs({ id: `cellar.books${z < 0 ? 'N' : 'S'}`, object: p, label: 'The house’s ledgers', highlight: false, onClick: () => ctx.dialogue.caption('caption.books') });
    }
    // the cabinet: a glazed case between the shelves, local +z facing into the room
    const cab = new THREE.Group(); cab.position.set(x - 0.05, 1.0, 0.05); cab.rotation.y = -Math.PI / 2; G.add(cab); // the case sits proud of the wall: its back must be in front of the wall plane for the raycast
    const cw = 1.08, ch = 1.08, cd = 0.2;
    const wood = M.walnut({ tint: '#2a1a12' });
    const back = F.rbox(cw, ch, 0.02, M.velvet({ color: '#1f3a2c' }), 0.004); back.position.set(0, ch / 2, -cd + 0.01); cab.add(back);
    for (const s of [-1, 1]) { const side = F.rbox(0.04, ch, cd, wood, 0.006); side.position.set(s * (cw / 2 - 0.02), ch / 2, -cd / 2); cab.add(side); }
    const topB = F.rbox(cw + 0.08, 0.06, cd + 0.06, wood, 0.008); topB.position.set(0, ch + 0.03, -cd / 2 + 0.02); cab.add(topB);
    const botB = F.rbox(cw + 0.08, 0.2, cd + 0.06, wood, 0.008); botB.position.set(0, -0.1, -cd / 2 + 0.02); cab.add(botB);
    const engraving = makeCanvasPlane(0.84, 0.07, (g, w, h) => drawEngraving(g, w, h), { px: 1024 });
    engraving.material.metalness = 0.5; engraving.material.roughness = 0.4; engraving.position.set(0, -0.1, 0.058); cab.add(engraving);
    this._hs({ id: 'cellar.engraving', object: engraving, label: 'An engraving', scope: ['focus:cellar.cabinet', 'room'], onClick: () => ctx.dialogue.caption('caption.cabinet.engraving', { top: this._inCabinet() }) });
    // four hooks with labels; the keys that are still here
    this.keyProps = {};
    const labelY = 0.42, hookY = 0.8;
    HOOK_X.forEach((hx, i) => {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 14, Math.PI * 1.2), this.brassM); hook.position.set(hx, hookY, -cd + 0.04); hook.rotation.z = Math.PI * 0.9; cab.add(hook);
      const text = i < 3 ? Object.values(KEYS)[i].label : `${tonight()}\nNo. 1031`;
      const lab = makeCanvasPlane(0.19, 0.075, (g, w, h) => drawLabel(g, w, h, text), { px: 256 }); lab.position.set(hx, labelY, -cd + 0.035); cab.add(lab);
      if (i === 3) this._hs({ id: 'cellar.fourth', object: lab, label: 'The fourth hook', scope: ['focus:cellar.cabinet', 'room'], onClick: () => ctx.dialogue.caption('caption.fourth', { top: this._inCabinet() }) });
    });
    for (const [id, k] of Object.entries(KEYS)) {
      const key = keyProp(k.teeth); key.position.set(HOOK_X[k.hook], hookY - 0.01, -cd + 0.055); cab.add(key);
      const proxy = this._proxy(0.1, 0.24, 0.08, [0, -0.1, 0.01], key);
      this.keyProps[id] = key;
      this._hs({
        id: `cellar.key.${id}`, object: proxy, label: () => ctx.items[id]?.name || id, highlight: key, scope: ['focus:cellar.cabinet', 'room'],
        enabled: () => this.house.isOpen('cabinet') && key.visible,
        onClick: async () => {
          if (!this.house.takeKey(id, { from: key })) return;
          key.visible = false;
          ctx.audio.play('pickup', { gain: 0.5 });
          const where = id === 'finchkey' ? (this.house.finchOut ? '.garden' : '.chair') : '';
          ctx.dialogue.caption(ctx.script?.[`caption.take.${id}${where}`] ? `caption.take.${id}${where}` : `caption.take.${id}`, { duration: 5, top: this._inCabinet() });
        },
      });
    }
    // the glazed door, hinged on the left (local −x), swinging into the room
    // hung from the top: it lifts up and out over the case when it opens, clear of the ledger shelf beside it
    const flap = new THREE.Group(); flap.position.set(0, ch, 0.0); cab.add(flap);
    const pivot = new THREE.Group(); pivot.position.set(-cw / 2 + 0.02, -ch, 0.0); flap.add(pivot);
    const frame = (w, h, px, py) => { const m = F.rbox(w, h, 0.03, wood, 0.004); m.position.set(px, py, 0); pivot.add(m); };
    frame(0.05, ch, 0.025, ch / 2); frame(0.05, ch, cw - 0.065, ch / 2); frame(cw - 0.04, 0.05, cw / 2 - 0.02, ch - 0.025); frame(cw - 0.04, 0.05, cw / 2 - 0.02, 0.025);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.12, ch - 0.1), M.glass({ color: '#c8d8c0', opacity: 0.14, roughness: 0.08 })); glass.position.set(cw / 2 - 0.02, ch / 2, 0.0); glass.renderOrder = 3; glass.userData.noRaycast = true; pivot.add(glass);
    const cracks = makeCanvasPlane(cw - 0.12, ch - 0.1, (g, w, h) => drawCracks(g, w, h), { px: 512, emissive: true, transparent: true }); cracks.position.set(cw / 2 - 0.02, ch / 2, 0.004); cracks.material.depthWrite = false; cracks.renderOrder = 4; cracks.visible = false; cracks.userData.noRaycast = true; pivot.add(cracks);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), this.brassM); knob.position.set(cw - 0.1, ch / 2 - 0.05, 0.025); pivot.add(knob);
    // the lock: a brass plate on the bottom rail with three flip counters and a hole meant for a watch key
    const lockPlate = F.rbox(0.36, 0.11, 0.012, this.brassM, 0.003); lockPlate.position.set(0, 0.06, 0.02); cab.add(lockPlate);
    const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.007, 10), M.matte('#060402')); keyhole.position.set(0.15, 0.06, 0.027); cab.add(keyhole);
    const vals = ctx.state.get('cellar.cabinet.counters', [0, 0, 0]);
    this.counters = vals.map((v, i) => {
      const c = makeCanvasPlane(0.062, 0.084, (g, w, h) => drawCounter(g, w, h, v), { px: 128, emissive: true });
      c.material.color.setScalar(0.85); c.position.set(-0.09 + i * 0.08, 0.06, 0.028); c.userData.value = v; cab.add(c);
      const bezel = F.rbox(0.07, 0.092, 0.006, M.iron({ color: '#3a3632', roughness: 0.4 }), 0.002); bezel.position.set(-0.09 + i * 0.08, 0.06, 0.024); cab.add(bezel);
      return c;
    });
    this.cabinet = { group: cab, pivot, flap, cracks, glass, lockPlate };
    // shut: the counters and the labels, low enough to stay clear of the Back and Ring buttons (the caption goes on top);
    // open: up a little, to the hooks and the keys
    const pose = { position: [x - 1.45, 1.3, 0.05], lookAt: [x + 0.1, 1.2, 0.05], fov: 46 };
    const openPose = { position: [x - 1.6, 1.55, 0.05], lookAt: [x + 0.1, 1.5, 0.05], fov: 46 };
    const onOpen = async (verb) => {
      if (verb === 'force') { cracks.visible = true; ctx.audio.play('zap', { gain: 0.5, pitch: 0.5 }); await ctx.tween.delay(0.4); }
      ctx.audio.play('unlock', { gain: 0.6, pitch: 1.2 });
      this._setCounters(SOLUTION);
      await ctx.tween.delay(0.3);
      ctx.audio.play('drawerOpen', { gain: 0.4, pitch: 1.3 });
      await ctx.tween.to(flap.rotation, { x: OPEN_FLAP }, { duration: 0.9, ease: 'outCubic' });
      if (ctx.camera.inFocus && ctx.camera.scope === 'focus:cellar.cabinet') ctx.camera.refocus({ ...openPose, duration: 0.7 });
    };
    const force = () => { if (!this.house.isOpen('cabinet')) this.house.open('cabinet', 'force', { onOpen, stay: true }); };
    // captions here sit at the top of the screen: the counters are low in the frame
    const focus = () => {
      const shut = !this.house.isOpen('cabinet');
      const move = ctx.camera.focus({ ...(shut ? pose : openPose), scope: 'focus:cellar.cabinet', onExit: () => this.house.blurLock() });
      // the Ring button comes up with the move, not after it
      const ok = shut ? this.house.focusLock('cabinet', { onOpen, stay: true }) : true;
      return move.then(() => {
        if (shut) { if (ok && !ctx.dialogue.busy) ctx.dialogue.caption('caption.cabinet', { scope: 'focus:cellar.cabinet', duration: 6, top: true }); }
        else if (Object.keys(KEYS).some((id) => this.house.s.items[id] === 'away')) ctx.dialogue.caption('caption.cabinet.open', { scope: 'focus:cellar.cabinet', duration: 5 });
      });
    };
    this._hs({
      id: 'cellar.cabinet', object: cab, label: () => (this.house.isOpen('cabinet') ? 'The key cabinet: their keys' : 'The key cabinet: their keys, locked'), highlight: false,
      onClick: () => focus(),
      useItem: { bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    this.counters.forEach((c, i) => {
      const proxy = ctx.hotspots.proxyBox(0.075, 0.1, 0.04); proxy.position.copy(c.position); cab.add(proxy);
      this._hs({
        id: `cellar.counter${i}`, object: proxy, label: 'Flip counter', scope: 'focus:cellar.cabinet', highlight: c,
        enabled: () => !this.house.isOpen('cabinet'),
        onClick: () => this._flip(i, onOpen),
        useItem: { bonekey: force },
      });
    });
    this._cabinetFocus = focus;
  }
  _setCounters(vals) { this.counters.forEach((c, i) => { c.userData.value = vals[i]; c.userData.redraw((g, w, h) => drawCounter(g, w, h, vals[i])); }); }
  async _flip(i, onOpen) {
    const { ctx } = this;
    const c = this.counters[i];
    if (this.house.isOpen('cabinet')) return;
    // every click counts, however fast: the value moves now, the flip is only a picture of it
    c.userData.value = (c.userData.value + 1) % 10;
    ctx.audio.play('ratchet', { gain: 0.45, pitch: 1.5 + i * 0.12 });
    ctx.state.set('cellar.cabinet.counters', this.counters.map((x) => x.userData.value));
    const token = (c.userData.flip || 0) + 1; c.userData.flip = token;
    let drawn = false;
    ctx.tween.run(0.2, (k) => {
      if (c.userData.flip !== token) return; // a newer click took over the picture
      if (k >= 0.3 && !drawn) { drawn = true; c.userData.redraw((g, w, h) => drawCounter(g, w, h, c.userData.value)); }
      c.scale.y = k < 0.3 ? 1 - (k / 0.3) * 0.94 : 0.06 + ((k - 0.3) / 0.7) * 0.94;
    }).then(() => { if (c.userData.flip === token) { c.scale.y = 1; if (!drawn) c.userData.redraw((g, w, h) => drawCounter(g, w, h, c.userData.value)); } });
    if (this.counters.every((x, j) => x.userData.value === SOLUTION[j])) this.house.open('cabinet', 'pick', { onOpen, stay: true });
  }

  // ───────────────────────────────────────────────── centre: the table, the book, the bell
  _buildTable() {
    const S = this.statics, G = this.group, { ctx } = this;
    const table = F.table({ w: 1.6, d: 0.85, h: 0.8, material: M.oak({ tint: '#4a3220', planks: 5 }), legs: 'square' }); table.position.set(0, 0, 0.1); S.add(table);
    const top = table.userData.topY ?? 0.8;
    // the ledger, open: two leaves on a dark cover, your page on the right, hers underneath if you left it
    const book = new THREE.Group(); book.position.set(-0.1, top, 0.12); book.rotation.y = 0.06; book.position.add(table.position); G.add(book);
    const cover = F.rbox(0.66, 0.02, 0.44, new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.6 }), 0.004); cover.position.y = 0.01; book.add(cover);
    const block = F.rbox(0.62, 0.035, 0.4, M.parchment({ tint: '#cdbb90' }), 0.003); block.position.y = 0.038; book.add(block);
    const left = makeCanvasPlane(0.29, 0.38, (g, w, h) => drawLeftPage(g, w, h), { px: 512 }); left.rotation.x = -Math.PI / 2; left.position.set(-0.155, 0.057, 0); left.rotation.z = 0.0; book.add(left);
    const right = makeCanvasPlane(0.29, 0.38, (g, w, h) => drawYourPage(g, w, h, this.house.s), { px: 512 }); right.rotation.x = -Math.PI / 2; right.position.set(0.155, 0.057, 0); book.add(right);
    const spine = F.rbox(0.02, 0.012, 0.4, M.matte('#1a100c'), 0.002); spine.position.set(0, 0.06, 0); book.add(spine);
    const leaf = F.rbox(0.27, 0.004, 0.36, M.parchment({ tint: '#e2d2a8' }), 0.001); leaf.position.set(0.19, 0.035, 0.035); leaf.rotation.y = -0.08; book.add(leaf);
    this.book = { group: book, right, left, leaf };
    this._proxy(0.92, 0.14, 0.64, [0, 0.05, 0], book); // the whole open book and a margin: one target for paying
    this._hs({
      id: 'cellar.ledger', object: book, label: 'The ledger', highlight: block, scope: ['focus:cellar.ledger', 'room'],
      onClick: () => this._ledgerClick(),
      useItem: { '*': ({ item }) => this._useOnLedger(item) },
    });
    // the bell
    const bell = new THREE.Group(); bell.position.set(0.5, top, 0.2); bell.position.add(table.position); G.add(bell);
    const dome = F.lathe([[0.0, 0.0], [0.055, 0.0], [0.058, 0.01], [0.05, 0.03], [0.035, 0.05], [0.012, 0.062], [0, 0.064]], M.brass({ polished: true }), 24); bell.add(dome);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 12), M.iron({ color: '#3a3632' })); btn.position.y = 0.068; bell.add(btn);
    this._proxy(0.14, 0.1, 0.14, [0, 0.05, 0], bell);
    this._hs({
      id: 'cellar.bell', object: bell, label: 'Service bell',
      onClick: async () => {
        ctx.audio.play('chime', { gain: 0.7, pitch: 1.6 });
        ctx.tween.to(btn.position, { y: 0.06 }, { duration: 0.06 }).then(() => ctx.tween.to(btn.position, { y: 0.068 }, { duration: 0.2, ease: 'outBack' }));
        this.tallow.userData.lookAt(this._cam(), 4);
        if (!ctx.state.get('cellar.bell.said')) { ctx.state.set('cellar.bell.said', true); await ctx.dialogue.say('react.bell.cellar'); return; }
        ctx.hints.ask();
      },
    });
    // a pen and an inkwell, hers
    const ink = F.lathe([[0.03, 0], [0.032, 0.03], [0.02, 0.04], [0.012, 0.05], [0, 0.05]], M.glass({ color: '#203030', opacity: 0.7 }), 14); ink.position.set(-0.55, top, 0.0); ink.position.add(table.position); ink.renderOrder = 2; G.add(ink);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.17, 6), M.matte('#1a1410')); pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5; pen.position.set(-0.45, top + 0.006, -0.12); pen.position.add(table.position); S.add(pen);
    this._ledgerPose = { position: [table.position.x - 0.1, top + 0.78, table.position.z + 0.95], lookAt: [table.position.x - 0.1, top + 0.02, table.position.z + 0.1], fov: 40 };
    this.tableTop = new THREE.Vector3(table.position.x - 0.1, top + 0.06, table.position.z + 0.12);
  }
  _syncBook() {
    if (!this.book) return;
    const s = this.house.s;
    this.book.right.userData.redraw((g, w, h) => drawYourPage(g, w, h, s));
    this.book.leaf.visible = !s.page_taken;
  }
  /** In the shut cabinet's close-up the counters sit low in the frame: captions there go to the top of the screen. */
  _inCabinet() { return this.ctx.camera.inFocus && this.ctx.camera.scope === 'focus:cellar.cabinet' && !this.house.isOpen('cabinet'); }
  _inLedger() { return this.ctx.camera.inFocus && this.ctx.camera.scope === 'focus:cellar.ledger'; }
  /** Something in your pockets would pay a line now (her page always brings its own). */
  _canSettle() { return ['pliers', 'lantern', 'wrench', 'hatpin', 'blank', 'page'].some((id) => this.house.canPay(id)); }
  async _ledgerClick() {
    const { ctx } = this;
    if (this._settling) return;
    // her offer stands on ANY empty-handed click of the book (from the room too): Pell's page is behind yours and a line is unpaid
    if (this.house.canOffer()) {
      if (!this._inLedger()) await ctx.camera.focus({ ...this._ledgerPose, scope: 'focus:cellar.ledger' });
      return this._offer();
    }
    if (!this._inLedger()) await ctx.camera.focus({ ...this._ledgerPose, scope: 'focus:cellar.ledger' });
    if (this.house.canOffer()) return this._offer();
    // nothing in hand: how the book is paid (once a visit, while something you carry would pay), otherwise the paper
    if (this._canSettle() && !this._howSaid) { this._howSaid = true; this.tallow.userData.lookAt(this._cam(), 4); await ctx.dialogue.say('react.ledger.how'); return; }
    ctx.audio.play('page', { gain: 0.4 });
    ctx.papers.show('ledger');
  }
  async _offer() {
    const { ctx } = this;
    if (this._settling) return;
    this._settling = true;
    try {
      this.tallow.userData.lookAt(this._cam(), 6);
      if (this.house.present('pell')) this.pell.userData.lookAt(this._cam(), 12);
      ctx.audio.play('page', { gain: 0.4, pitch: 0.9 });
      await this.house.offerPell();
    } finally { this._settling = false; }
  }
  async _useOnLedger(item) {
    const { ctx } = this;
    if (this._settling) return;
    if (isKey(item) || item === 'bonekey') { this.tallow.userData.lookAt(this._cam(), 4); await this.house.pay(item); return; } // refused, with the line; nothing burns
    if (!this.house.canPay(item)) {
      const currency = ['pliers', 'lantern', 'wrench', 'hatpin', 'blank', 'page'].includes(item);
      if (currency && this.house.has(item) && !this.house.unpaid) { this.tallow.userData.lookAt(this._cam(), 4); await ctx.dialogue.say('react.pay.nothing'); return; }
      ctx.dialogue.caption('caption.nope'); return;
    }
    this._settling = true;
    try {
      ctx.hotspots.lock();
      this.tallow.userData.lookAt(this.tableTop.clone(), 5);
      if (ctx.camera.inFocus) await ctx.camera.exitFocus();
      const flight = this._burn(item);
      const paid = await this.house.pay(item);
      await flight;
      if (!paid) return;
      if (item === 'lantern') this._carried.set(false);
    } finally { ctx.hotspots.unlock(); this._settling = false; }
  }
  /** The item lifts off the book, crosses the room and goes into the furnace. */
  async _burn(item) {
    const { ctx } = this;
    const c = ctx.inventory.icon(item, 128);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.renderOrder = 5; m.userData.noRaycast = true; this.group.add(m);
    const from = this.tableTop.clone().add(new THREE.Vector3(0, 0.08, 0)), to = this.furnaceMouth.clone(), mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.75, 0));
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    ctx.camera.lookAtPoint(to.clone().add(new THREE.Vector3(0.6, 0.3, 0)));
    ctx.audio.play('swoosh', { gain: 0.35, pitch: 0.8 });
    await ctx.tween.run(1.5, (k) => { curve.getPoint(k, m.position); m.quaternion.copy(ctx.camera.camera.quaternion); m.material.opacity = k > 0.9 ? (1 - k) * 10 : 1; }, { ease: 'inOutSine' });
    this.group.remove(m); tex.dispose(); m.material.dispose();
    ctx.audio.play('whump', { gain: 0.5, pitch: 1.1 });
    P.burst(ctx, this.group, [to.x, to.y + 0.1, to.z], { color: '#ff9a4a', color2: '#ffd27a', count: 40, radius: 0.5, duration: 1.6, size: 0.03 });
    this._flare(1);
    await ctx.tween.delay(0.4);
  }

  // ───────────────────────────────────────────────── south: the stair up
  _buildStair() {
    const S = this.statics, G = this.group, { ctx } = this;
    const stone = M.smoothStone({ color: '#5a544c', roughness: 0.9 });
    const x = -1.0, w = 1.3;
    const alcove = new THREE.Group(); alcove.position.set(x, 0, D / 2); G.add(alcove);
    // steps rising south through the wall, walls either side, the landing and the baize door at the top
    const steps = 9, rise = 0.24, run = 0.3;
    for (let i = 0; i < steps; i++) { const s = F.rbox(w, rise, run, stone, 0.008); s.position.set(0, rise * (i + 0.5), -0.3 + run * (i + 0.5)); s.receiveShadow = true; S.add(s); s.position.add(alcove.position); }
    const wallM = M.stone({ tint: '#5a4e44', rows: 5, cols: 6, repeat: [2, 1.2], seed: 19 });
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, H + 0.6), wallM); m.position.set(s * w / 2, H / 2 + 0.3, 1.82); m.rotation.y = -s * Math.PI / 2; m.userData.keep = true; S.add(m); m.position.add(alcove.position); }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.6), wallM); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H + 0.3, 1.82); ceil.userData.keep = true; S.add(ceil); ceil.position.add(alcove.position);
    const landing = F.rbox(w, 0.1, 0.9, stone, 0.01); landing.position.set(0, steps * rise - 0.05, -0.3 + run * steps + 0.45); S.add(landing); landing.position.add(alcove.position);
    // the baize door at the top, standing open: a green leaf against the hall's grey
    const doorZ = -0.3 + run * steps + 0.9;
    const hallGlow = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.3), new THREE.MeshStandardMaterial({ color: '#5a6a5a', emissive: '#3a4a3a', emissiveIntensity: 0.5, roughness: 1 })); hallGlow.position.set(0, steps * rise + 1.15, doorZ); alcove.add(hallGlow);
    const baize = F.rbox(0.06, 2.15, 0.95, new THREE.MeshStandardMaterial({ color: '#1e4a2a', roughness: 1, bumpMap: noiseTexture({ scale: 30, seed: 51 }), bumpScale: 0.3 }), 0.006); baize.position.set(-w / 2 + 0.1, steps * rise + 1.1, doorZ - 0.5); baize.rotation.y = 0.35; alcove.add(baize);
    const sproxy = this._proxy(w, 2.4, 2.6, [0, 1.3, 1.1], alcove);
    this._hs({ id: 'cellar.stair', object: sproxy, label: 'The stair up', highlight: false, onClick: () => this._stair() });
    this.stairTop = new THREE.Vector3(x, steps * rise + 1.0, D / 2 + doorZ);
    // the hall's grey-green light comes down the stair and lies along the flags ahead of you, so the way up reads from
    // the stair foot without turning round; its far end is a second way to the stair
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.8), new THREE.MeshBasicMaterial({ map: spillTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    spill.rotation.x = -Math.PI / 2; spill.position.set(x - 0.15, 0.006, D / 2 - 2.0); spill.renderOrder = 1; spill.userData.noRaycast = true; G.add(spill);
    const sfar = this._proxy(1.5, 0.5, 3.6, [x - 0.15, 0.25, D / 2 - 2.0]); // the whole spill, not its far edge
    this._hs({
      id: 'cellar.stair.light', object: sfar, label: 'Light from the stair, behind you', highlight: false,
      onClick: () => this._toStair(),
    });
    this._stairLook = new THREE.Vector3(x, 1.3, D / 2 + 0.2);
  }
  /** Turn round to the stair, then up it (the stair choices first); turned back to the book if the player stays. */
  async _toStair() {
    const { ctx } = this;
    if (this._leaving || this._settling) return;
    ctx.camera.lookAtPoint(this._stairLook);
    await ctx.tween.delay(0.6);
    if (!(await this._stair({ ask: true }))) ctx.camera.resetLook();
  }
  /** Resolves true when the player went up. */
  async _stair({ ask = false } = {}) {
    const { ctx } = this;
    if (this._leaving || this._settling) return false;
    this.tallow.userData.lookAt(this._cam(), 6);
    const owed = this.house.unpaid, short = this.house.teeth < 4;
    if (owed) { const i = await ctx.dialogue.choice('choice.stair.owed'); if (i !== 0) return false; }
    if (short) { const i = await ctx.dialogue.choice('choice.stair.teeth'); if (i !== 0) return false; }
    // Back / the stair light never ends the night unasked: a plain "go up?" when nothing else stops you
    if (ask && !owed && !short) { const i = await ctx.dialogue.choice('choice.stair.up'); if (i !== 0) return false; }
    this._leaving = true;
    ctx.hotspots.lock();
    try {
      await this.house.goUp();
      this._syncKeys();
      ctx.camera.lookAtPoint(this.stairTop);
      ctx.audio.play('footstep', { gain: 0.4, pitch: 0.8 });
      for (let i = 0; i < 4; i++) { setTimeout(() => ctx.audio.play('clockTick', { gain: 0.25 + i * 0.1, pitch: 0.7 }), 500 + i * 450); }
      await ctx.tween.delay(0.9);
      await ctx.game.goToRoom('midnight', { duration: 1.4 });
    } finally { ctx.hotspots.unlock(); }
    return true;
  }

  // ───────────────────────────────────────────────── the people down here
  _buildPeople() {
    const { ctx } = this;
    const tallow = makeFigure({ kind: 'tallow' }); tallow.position.set(...TALLOW.pos); tallow.rotation.y = TALLOW.yaw; this.group.add(tallow);
    this.tallow = tallow;
    this._hs({
      id: 'cellar.tallow', object: tallow, label: 'Mrs. Tallow',
      onClick: () => ctx.hints.ask(),
      useItem: { '*': ({ item }) => (this.house.canPay(item) || isKey(item) ? ctx.dialogue.say([{ who: 'tallow', text: 'On the book, not to me. I only write.' }]) : ctx.dialogue.caption('caption.nope')) },
    });
    const pell = makeFigure({ kind: 'pell' }); pell.position.set(...PELL.pos); pell.rotation.y = PELL.yaw; pell.visible = false; this.group.add(pell);
    const wick = makeFigure({ kind: 'wick', pose: 'standing' }); wick.position.set(...WICK.pos); wick.rotation.y = WICK.yaw; wick.visible = false; this.group.add(wick);
    this.pell = pell; this.wick = wick;
    // the pocket each key goes into
    const pk = keyProp(9); pk.scale.setScalar(0.8); pk.position.set(0.13, 0.92, 0.15); pk.rotation.z = 0.3; pk.visible = false; pell.add(pk);
    const wk = keyProp(9); wk.scale.setScalar(0.8); wk.position.set(-0.12, 0.98, 0.16); wk.rotation.z = -0.25; wk.visible = false; wick.add(wk);
    this.pocket = { pellkey: pk, wickkey: wk };
    const resident = (fig, who, keyId, lineKey) => this._hs({
      id: `cellar.${who}`, object: fig, label: ctx.items[keyId]?.name?.replace(/'s key$/, '') || who, enabled: () => fig.visible,
      onClick: () => {
        fig.userData.lookAt(this._cam(), 5);
        // their key still on its hook: they say where it is (the cabinet), not just how they feel
        const ask = `react.${who}.ask`;
        if (this.house.s.items[keyId] === 'away' && ctx.script?.[ask] && !ctx.state.get(`cellar.${who}.asked`)) { ctx.state.set(`cellar.${who}.asked`, true); ctx.dialogue.say(ask); return; }
        ctx.dialogue.say(lineKey);
      },
      useItem: {
        wickkey: () => this._wrongKey(fig), pellkey: () => this._wrongKey(fig), finchkey: () => this._wrongKey(fig),
        [keyId]: () => this._giveKey(keyId, who, fig), // their own key, last so it wins
        '*': () => ctx.dialogue.caption('caption.nope'),
      },
    });
    resident(pell, 'pell', 'pellkey', 'react.pell.here');
    resident(wick, 'wick', 'wickkey', 'react.wick.here');
  }
  _wrongKey(fig) { fig.userData.lookAt(this._cam(), 3); this.tallow.userData.lookAt(this._cam(), 4); return this.ctx.dialogue.say('react.key.wrong'); }
  async _giveKey(id, who, fig) {
    const { ctx } = this;
    if (!this.house.has(id) || this._settling) return;
    this._settling = true;
    ctx.hotspots.lock();
    try {
      fig.userData.lookAt(this._cam(), 8);
      // the key crosses from your hand to theirs
      const k = keyProp(KEYS[id].teeth); this.group.add(k);
      const cam = ctx.camera.camera, from = cam.position.clone().add(new THREE.Vector3(0, -0.35, 0)).add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.6));
      const to = this.pocket[id].getWorldPosition(new THREE.Vector3());
      ctx.audio.play('swoosh', { gain: 0.3, pitch: 1.2 });
      await ctx.tween.run(0.9, (t) => { k.position.lerpVectors(from, to, t); k.position.y += Math.sin(t * Math.PI) * 0.25; k.rotation.y = t * 4; }, { ease: 'inOutSine' });
      this.group.remove(k);
      this.pocket[id].visible = true;
      ctx.audio.play('drop', { gain: 0.4, pitch: 1.3 });
      await this.house.giveKey(id, who);
    } finally { ctx.hotspots.unlock(); this._settling = false; }
  }
  /** House.open('ring') calls this: she does not walk down here; the cabinet is three steps from the book. */
  async tallowTo(lockId) {
    if (lockId !== 'cabinet') return;
    this.tallow.userData.lookAt(this.cabinet.group.getWorldPosition(new THREE.Vector3()).setY(1.5), 4);
    await this.ctx.tween.delay(0.5);
  }
  onClockTick() { this.ctx.audio.play('clockTick', { gain: 0.3, pitch: 0.7 }); }
  onHintAsked() { this.tallow.userData.lookAt(this._cam(), 5); }
  /** Hints: with the cabinet open and someone down here still without their key, say where the keys are (once). */
  looseEnd() {
    const h = this.house;
    if (!h.isOpen('cabinet')) return null;
    const waiting = ['wick', 'pell'].some((r) => h.present(r) && h.s.items[`${r}key`] !== 'given');
    return waiting ? 'hint.cellar.keys' : null;
  }

  /** Hints: once the cabinet is open, Tallow's idle lines leave it alone (no cabinet line after it has given up its keys). */
  idleFilter(lines) { return !(this.house.isOpen('cabinet') && lines.some((l) => /cabinet/i.test(l.text || ''))); }

  /** HUD Back ("The stair") / Esc with no close-up open: turn to the stair and ask to go up (stay → turn back). */
  onBack() {
    const { ctx } = this;
    if (ctx.camera.inFocus || ctx.dialogue.busy || this._leaving || this._settling) return false;
    this._toStair();
    return true;
  }

  // ───────────────────────────────────────────────── restore / lifecycle
  _syncKeys() { for (const id of Object.keys(KEYS)) { const st = this.house.s.items[id]; this.keyProps[id].visible = st === 'away' || st === 'hook'; if (this.pocket[id]) this.pocket[id].visible = st === 'given'; } }
  _restore() {
    const h = this.house;
    if (h.isOpen('cabinet')) { this.cabinet.flap.rotation.x = OPEN_FLAP; this._setCounters(SOLUTION); if (h.verb('cabinet') === 'force') this.cabinet.cracks.visible = true; }
    this._syncKeys();
    this.pell.visible = h.present('pell');
    this.wick.visible = h.present('wick');
    this._syncBook();
    const burned = Object.values(h.s.items).filter((v) => v === 'burned').length;
    this.fire.userData.baseIntensity += burned * 1.2; this.fire.userData.setLit(true, 0);
  }
  enter() {
    const { ctx } = this;
    this._leaving = false; this._settling = false; this._howSaid = false;
    this._carried.set(this.house.lantern === 'carried');
    // the furnace, its fire and the drip are the room's ambience bed (Audio.js ROOM_BEDS.cellar)
    ctx.audio.setClockRunning?.(false);
    if (!ctx.state.get('cellar.intro.seen')) {
      ctx.state.set('cellar.intro.seen', true);
      this._timers.push(setTimeout(async () => {
        if (ctx.game.currentRoom !== this) return;
        this.tallow.userData.lookAt(this._cam(), 10);
        if (ctx.memorial.nights.length) await ctx.dialogue.say('cellar.again');
        await ctx.dialogue.say('cellar.intro');
      }, 1200));
    }
  }
  enterTitle() { this._carried.set(false); }
  exit() { for (const t of this._timers) clearTimeout(t); this._timers = []; this._carried.set(false); }
  update(dt, t) { this._carried.update(dt, t); }
}

// ───────────────────────────────────────────────── props
/** A resident's key: iron-grey, the yellow key's shape, hanging bow-up. Origin at the bow's centre. */
export function keyProp(teeth = 9) {
  const g = new THREE.Group();
  const m = M.iron({ color: '#8a8782', roughness: 0.45 });
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 18), m); g.add(bow);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.008), m); shaft.position.y = -0.085; g.add(shaft);
  for (let i = 0; i < teeth; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.007), m); t.position.set(0.012 + 0.005 + (i % 3) * 0.003, -0.08 - i * 0.008, 0); g.add(t); }
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.007), m); bit.position.set(0.016, -0.135, 0); g.add(bit);
  return g;
}

// ───────────────────────────────────────────────── canvas drawings
function brassField(g, w, h, seed = 3) {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#b08a3c'); gr.addColorStop(0.45, '#d9b25a'); gr.addColorStop(0.55, '#c9a24a'); gr.addColorStop(1, '#8f6c26');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,40,10,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
  g.strokeStyle = 'rgba(70,45,10,0.7)'; g.lineWidth = Math.max(2, h * 0.02); g.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  g.strokeStyle = 'rgba(255,240,200,0.35)'; g.lineWidth = 1; g.strokeRect(h * 0.08 + 2, h * 0.08 + 2, w - h * 0.16 - 4, h - h * 0.16 - 4);
  for (const [x, y] of [[h * 0.2, h * 0.5], [w - h * 0.2, h * 0.5]]) { g.fillStyle = '#5a4418'; g.beginPath(); g.arc(x, y, h * 0.06, 0, TAU); g.fill(); g.strokeStyle = '#e8d090'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - h * 0.04, y - h * 0.03); g.lineTo(x + h * 0.04, y + h * 0.03); g.stroke(); }
}
function engraved(g, text, x, y, size, { font = '"Cormorant Garamond", Georgia, serif', weight = 700, italic = false, maxW } = {}) {
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  if (maxW && g.measureText(text).width > maxW) { size = Math.floor(size * maxW / g.measureText(text).width); g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,240,200,0.45)'; g.fillText(text, x, y + size * 0.045);
  g.fillStyle = '#2a1a08'; g.fillText(text, x, y);
}
function drawPlate(g, w, h, text, { copperplate = false, blank = false } = {}) {
  brassField(g, w, h, text.length);
  if (blank) { engraved(g, text, w / 2, h / 2, h * 0.42, { weight: 600, maxW: w * 0.5 }); return; }
  engraved(g, text, w / 2, h / 2, h * 0.5, { italic: copperplate, weight: copperplate ? 500 : 700, maxW: w * 0.84 });
}
function drawEngraving(g, w, h) {
  brassField(g, w, h, 7);
  engraved(g, 'THE HOUSE KEEPS THE LAST OF EVERYTHING', w / 2, h / 2, h * 0.5, { weight: 700, maxW: w * 0.86 });
}
function drawLabel(g, w, h, text) {
  g.fillStyle = '#e2d4b0'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#5a4a30'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
  const lines = text.split('\n');
  g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = lines.length > 1 ? h * 0.34 : h * 0.5;
  g.font = `700 ${size}px "Cormorant Garamond", Georgia, serif`;
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
}
function drawCounter(g, w, h, v) {
  g.fillStyle = '#0e0c0a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#efe6cc'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.72)}px Inter, sans-serif`; g.fillText(String(v), w / 2, h * 0.54);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, h * 0.49, w, h * 0.02);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, h * 0.1); g.fillRect(0, h * 0.9, w, h * 0.1);
}
function drawCracks(g, w, h) {
  g.clearRect(0, 0, w, h);
  const cx = w * 0.42, cy = h * 0.86, r = rng(3);
  g.strokeStyle = 'rgba(230,240,230,0.85)'; g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const a = r() * TAU, len = (0.25 + r() * 0.6) * h;
    let x = cx, y = cy; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += Math.cos(a + (r() - 0.5) * 0.6) * len / 5; y += Math.sin(a + (r() - 0.5) * 0.6) * len / 5; g.lineTo(x, y); }
    g.stroke();
  }
  for (let k = 1; k <= 3; k++) { g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, h * 0.07 * k, 0, TAU); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill();
}
function drawCoals(g, w, h) {
  const gr = g.createRadialGradient(w / 2, h * 0.7, w * 0.05, w / 2, h * 0.6, w * 0.7); gr.addColorStop(0, '#ffd890'); gr.addColorStop(0.35, '#ff7a2a'); gr.addColorStop(0.8, '#7a1a08'); gr.addColorStop(1, '#2a0a04');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(13);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,6,2,${0.5 + r() * 0.5})`; g.beginPath(); g.arc(r() * w, h * 0.45 + r() * h * 0.55, 6 + r() * 14, 0, TAU); g.fill(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,220,140,${r() * 0.6})`; g.fillRect(r() * w, h * 0.5 + r() * h * 0.45, 3, 2); }
}
function pageField(g, w, h) {
  g.fillStyle = '#d7c69c'; g.fillRect(0, 0, w, h);
  const r = rng(5);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(120,90,40,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.strokeStyle = 'rgba(120,90,50,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 20; i++) { const y = h * (0.14 + i * 0.042); g.beginPath(); g.moveTo(w * 0.08, y); g.lineTo(w * 0.92, y); g.stroke(); }
  g.strokeStyle = 'rgba(150,40,30,0.5)'; g.beginPath(); g.moveTo(w * 0.16, h * 0.08); g.lineTo(w * 0.16, h * 0.96); g.stroke();
}
function drawLeftPage(g, w, h) {
  pageField(g, w, h);
  g.fillStyle = '#3a2a18'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = `600 ${h * 0.034}px "Cormorant Garamond", Georgia, serif`; g.fillText('The night of October 31st', w * 0.18, h * 0.1);
  g.font = `italic 500 ${h * 0.028}px "Cormorant Garamond", Georgia, serif`;
  const r = rng(9);
  for (let i = 0; i < 18; i++) {
    const y = h * (0.14 + i * 0.042) - h * 0.012;
    g.fillStyle = 'rgba(50,35,20,0.75)'; g.fillRect(w * 0.18, y - 1, w * (0.3 + r() * 0.4), 2);
    if (r() > 0.25) { g.strokeStyle = 'rgba(60,40,20,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w * 0.17, y); g.lineTo(w * 0.9, y + (r() - 0.5) * 4); g.stroke(); }
  }
}
/** A long fan of cool light on the floor, narrow and brightest at the stair foot, widening and fading ahead. */
function spillTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  // canvas top is the far end (world −Z), the bottom the stair foot
  // only the far third shows from the stair foot, so it carries most of the light (it reads as cool hall light on the flags)
  grad.addColorStop(0, 'rgba(150,185,155,0.0)'); grad.addColorStop(0.08, 'rgba(150,185,155,0.55)'); grad.addColorStop(1, 'rgba(180,210,180,0.8)');
  g.fillStyle = grad;
  g.filter = 'blur(6px)';
  g.beginPath(); g.moveTo(6, 0); g.lineTo(122, 0); g.lineTo(96, 512); g.lineTo(32, 512); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function drawYourPage(g, w, h, s) {
  pageField(g, w, h);
  g.fillStyle = '#3a2a18'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = `600 ${h * 0.034}px "Cormorant Garamond", Georgia, serif`; g.fillText('No. 1031', w * 0.18, h * 0.1);
  const mine = s.favours.filter((f) => f.page === 'mine');
  const what = (f) => (f.lock === 'early' ? 'went down early' : f.lock === 'pell' ? 'one of Miss Pell’s' : LOCKS[f.lock]?.label || f.lock);
  g.font = `italic 500 ${h * 0.03}px "Cormorant Garamond", Georgia, serif`;
  mine.forEach((f, i) => {
    const y = h * (0.14 + i * 0.042) - h * 0.012;
    const text = `${i + 1}. ${what(f)}`;
    g.fillStyle = f.lock === 'pell' ? '#1a2a4a' : '#2a1a10'; g.fillText(text, w * 0.18, y);
    if (f.paid) { g.strokeStyle = 'rgba(60,30,20,0.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.17, y); g.lineTo(w * 0.18 + g.measureText(text).width + 4, y + 1); g.stroke(); }
  });
  if (!mine.length) { g.fillStyle = 'rgba(60,45,30,0.6)'; g.fillText('nothing, as yet', w * 0.18, h * 0.14 - h * 0.012); }
  const u = mine.filter((f) => !f.paid).length;
  g.font = `500 ${h * 0.028}px "Cormorant Garamond", Georgia, serif`; g.fillStyle = '#3a2a18';
  g.fillText(u ? `${u} unpaid` : 'nothing unpaid', w * 0.18, h * 0.93);
}
