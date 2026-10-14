// THE PARLOUR (`parlour`). See docs/GAME.md §5.
//
// Layout (metres, floor centre origin, north = −Z; the player stands just inside the foyer door at the east end looking west):
//   east  (+X, behind): the door back to the foyer, always open
//   north (−Z): the fireplace with a fire laid and never lit, the mantel clock under its smoked dome, the mirror, the sampler,
//               the bell-pull, the gas lamp turned low
//   south (+Z): the sideboard with the tea caddy (clock-face lock) and the gramophone; the hat on its stand
//   centre:     the card table laid for four, four cards face up (two, three, ace, three), Miss Pell beside it
//   west  (−X): the bay window, shuttered, a bar across the shutters held by a brass lever lock
// Locks: caddy (two clock hands, 4:15, stay), shutters (four levers 2 3 1 3, needs the hatpin).
import * as THREE from 'three';
import { Room } from '../../engine/Room.js';
import * as M from '../../engine/props/materials.js';
import * as F from '../../engine/props/furniture.js';
import * as P from '../../engine/props/particles.js';
import * as L from '../../engine/props/lights.js';
import { makeCanvasPlane } from '../../engine/props/text.js';
import { rng, noiseTexture } from '../../engine/props/textures.js';
import { makeFigure } from '../../engine/props/figure.js';
import { mergeStatic, carriedLight, wallpaperTexture, tileTexture, lanternProp } from '../shared.js';

const TAU = Math.PI * 2;
const W = 7, D = 5.6, H = 3.3;
const CADDY_SOLUTION = [4, 3];        // short hand at 4, long hand at 15 (index 3 of twelve five-minute steps)
const LEVER_SOLUTION = [1, 2, 0, 2];  // heights 2, 3, 1, 3 as 0-based notches
const NOTCH = 0.017;
const BAY = { z0: 1.3, depth: 1.0, inner: 0.75 }; // the opening's half-width, how far the bay goes out, the centre panel's half-width
const DOOR = { z: 1.6, w: 1.05, h: 2.15 };
const PELL = { pos: [-1.15, 0, -0.8], yaw: Math.PI / 2 };
const PELL_SEAT = { pos: [-0.7, 0, -0.31], yaw: 0 };
const TALLOW_DOOR = { pos: [3.25, 0, DOOR.z], yaw: -Math.PI / 2 };
// after the call she stands in the left of the default view, clear of the caddy, the gramophone and Pell's way out
const TALLOW_SIDE = { pos: [-0.1, 0, 1.2], yaw: Math.atan2(2.4, -0.9) };
// where she stands after a ring: clear of the caddy close-up (behind its camera) and of the default view's left edge
const TALLOW_SPOTS = { caddy: { pos: [-0.9, 0, 1.45], yaw: 0.73 }, shutters: { pos: [-2.55, 0, 0.6], yaw: -Math.PI / 2 } };
// Miss Pell's way out at the call: round the fireplace side of the table, across the front of the room, out of the door
const PELL_OUT = [[-0.4, 0, -1.3], [0.95, 0, -0.15], [1.5, 0, 1.35], [W / 2 + 0.75, 0, DOOR.z]];
const SERIF = '"Cormorant Garamond", Georgia, serif';

export default class Parlour extends Room {
  static id = 'parlour';
  static title = 'The Parlour';
  static vantage = { position: [2.3, 1.6, 0.3], lookAt: [-0.6, 1.1, 0.35], yawLimit: 180, pitchLimit: 30, fov: 62 };
  static puzzleOrder = ['caddy', 'shutters'];
  /** The HUD's Back, whenever no close-up is open: out to the hall (`onBack`). */
  backLabel = 'The hall';

  async build() {
    const { ctx } = this;
    this.background = new THREE.Color('#0a0605');
    this.fog = new THREE.FogExp2('#140c0a', 0.03);
    this.envIntensity = 0.3;
    this.exposure = 1.12;
    this.bloom = { strength: 0.4, threshold: 0.82, radius: 0.5 };
    this._timers = [];
    this.statics = new THREE.Group(); this.statics.name = 'statics'; this.group.add(this.statics);
    this._buildShell();
    this._buildLights();
    this._buildEast();
    this._buildNorth();
    this._buildSouth();
    this._buildTable();
    this._buildBay();
    this._buildPell();
    this._buildTallow();
    this._buildDressing();
    this.group.updateMatrixWorld(true);
    mergeStatic(this.statics);
    this._restore();
    this._carried = carriedLight(ctx, this.group);
  }

  // ───────────────────────────────────────────────── helpers
  _hs(spec) { return this.ctx.hotspots.add(spec); }
  /** The carried lantern sits a hand's width from the camera: in a close-up it would wash out the lock, so it steps back. */
  _closeUp(on) { this._carried?.set(!on && this.house.lantern === 'carried'); }
  _proxy(w, h, d, pos, parent = this.group) { const p = this.ctx.hotspots.proxyBox(w, h, d); p.position.set(...pos); parent.add(p); return p; }
  get house() { return this.ctx.house; }

  // ───────────────────────────────────────────────── shell and lights
  _buildShell() {
    const S = this.statics;
    const wall = new THREE.MeshStandardMaterial({ map: wallpaperTexture({ base: '#4e3236', motif: '#5c3e42', seed: 5 }), roughness: 0.95 });
    wall.map.repeat.set(6, 3);
    this.wallMat = wall;
    const floor = M.floorboards({ tint: '#5a3a24', repeat: [3.5, 2.8] });
    const shell = F.roomShell({ w: W, d: D, h: H, floor, wall, ceiling: M.plaster({ tint: '#5a4a44', repeat: [2, 2] }), beams: 0, wainscot: 0.9, omit: ['west', 'east'] });
    S.add(shell);
    // the west wall around the bay opening: two piers, a header, their wainscot and base
    const pier = (zc, len) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wall); m.position.set(-W / 2, H / 2, zc); m.rotation.y = Math.PI / 2; m.receiveShadow = true; S.add(m);
      const p = F.rbox(len, 0.9, 0.025, M.walnut({ tint: '#4a2f1e' }), 0.004); p.position.set(-W / 2 + 0.012, 0.45, zc); p.rotation.y = Math.PI / 2; S.add(p);
      const rail = F.rbox(len, 0.05, 0.05, M.walnut(), 0.01); rail.position.set(-W / 2 + 0.025, 0.9, zc); rail.rotation.y = Math.PI / 2; S.add(rail);
      const b = F.rbox(len, 0.14, 0.03, M.walnut(), 0.006); b.position.set(-W / 2 + 0.015, 0.07, zc); b.rotation.y = Math.PI / 2; S.add(b);
    };
    const pl = D / 2 - BAY.z0;
    pier(-BAY.z0 - pl / 2, pl); pier(BAY.z0 + pl / 2, pl);
    // the east wall around the open door to the hall: a real opening, so the way out reads as one
    const eastPiece = (zc, len) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wall); m.position.set(W / 2, H / 2, zc); m.rotation.y = -Math.PI / 2; m.receiveShadow = true; S.add(m);
      const p = F.rbox(len, 0.9, 0.025, M.walnut({ tint: '#4a2f1e' }), 0.004); p.position.set(W / 2 - 0.012, 0.45, zc); p.rotation.y = -Math.PI / 2; S.add(p);
      const rail = F.rbox(len, 0.05, 0.05, M.walnut(), 0.01); rail.position.set(W / 2 - 0.025, 0.9, zc); rail.rotation.y = -Math.PI / 2; S.add(rail);
      const b = F.rbox(len, 0.14, 0.03, M.walnut(), 0.006); b.position.set(W / 2 - 0.015, 0.07, zc); b.rotation.y = -Math.PI / 2; S.add(b);
    };
    const dn = DOOR.z - DOOR.w / 2, ds = DOOR.z + DOOR.w / 2;
    eastPiece((-D / 2 + dn) / 2, dn + D / 2); eastPiece((ds + D / 2) / 2, D / 2 - ds);
    const eHeader = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, H - DOOR.h), wall); eHeader.position.set(W / 2, DOOR.h + (H - DOOR.h) / 2, DOOR.z); eHeader.rotation.y = -Math.PI / 2; S.add(eHeader);
    const header = new THREE.Mesh(new THREE.PlaneGeometry(BAY.z0 * 2, H - 2.5), wall); header.position.set(-W / 2, 2.5 + (H - 2.5) / 2, 0); header.rotation.y = Math.PI / 2; S.add(header);
    // cornice on every wall, and a plaster rose over the table
    const cornice = M.plaster({ tint: '#7a6a62', repeat: [1, 1] });
    const strip = (len, x, z, ry) => { const m = F.rbox(len, 0.12, 0.1, cornice, 0.02); m.position.set(x, H - 0.06, z); m.rotation.y = ry; m.translateZ(0.05); S.add(m); };
    strip(W, 0, -D / 2, 0); strip(W, 0, D / 2, Math.PI); strip(D, W / 2, 0, -Math.PI / 2); strip(D, -W / 2, 0, Math.PI / 2);
    const rose = F.lathe([[0.42, 0], [0.38, 0.02], [0.3, 0.025], [0.26, 0.05], [0.14, 0.055], [0.08, 0.09], [0, 0.1]], cornice, 24); rose.position.set(-0.7, H, 0.1); rose.rotation.x = Math.PI; S.add(rose);
  }

  _buildLights() {
    const G = this.group;
    G.add(L.ambientRig({ sky: '#8a7a9a', ground: '#1a0e0a', hemi: 0.42, ambient: '#3a2a2a', ambientIntensity: 0.5 }));
    // the gas lamp is the one warm thing; a few fills so the room reads from the door
    this.gasLight = L.flickerLight({ color: '#ffb264', intensity: 2.2, distance: 7, flicker: 0.1, speed: 0.5 }); this.gasLight.position.set(0.6, 1.95, -2.45); G.add(this.gasLight);
    const centre = new THREE.PointLight('#d8a070', 2.0, 7, 2); centre.position.set(-0.4, 2.7, 0.2); G.add(centre);
    const sideboard = new THREE.PointLight('#e0b080', 1.9, 5, 2); sideboard.position.set(-0.6, 1.9, 1.9); G.add(sideboard);
    const bayWash = new THREE.PointLight('#8a90b8', 0.7, 5, 2); bayWash.position.set(-2.6, 2.2, 0); G.add(bayWash);
    const hearth = new THREE.PointLight('#c0a090', 0.9, 4, 2); hearth.position.set(-1.4, 1.6, -2.0); G.add(hearth);
    // moonlight through the bay, once the shutters are open
    const moon = L.keyLight({ color: '#9fb6ff', intensity: 0, position: [-5.4, 2.7, -0.3], target: [-0.3, 0, 0.3], angle: 0.6, penumbra: 0.7, distance: 16, castShadow: true });
    G.add(moon); this.moonLight = moon.userData.light;
    this.shaft = L.lightShaft({ from: [-4.0, 1.9, 0], to: [-0.6, 0.0, 0.35], radiusTop: 0.9, radiusBottom: 1.6, color: '#a9c4ff', opacity: 0 });
    G.add(this.shaft);
  }

  // ───────────────────────────────────────────────── east: the door back to the foyer
  _buildEast() {
    const G = this.group, S = this.statics, { ctx } = this;
    const wood = M.walnut({ tint: '#2e1e16' });
    const frame = new THREE.Group(); frame.position.set(W / 2 - 0.02, 0, DOOR.z); frame.rotation.y = -Math.PI / 2; S.add(frame);
    const fr = (w, h, x, y) => { const m = F.rbox(w, h, 0.16, wood, 0.008); m.position.set(x, y, 0); frame.add(m); };
    fr(0.1, DOOR.h + 0.1, -DOOR.w / 2 - 0.05, (DOOR.h + 0.1) / 2); fr(0.1, DOOR.h + 0.1, DOOR.w / 2 + 0.05, (DOOR.h + 0.1) / 2); fr(DOOR.w + 0.2, 0.12, 0, DOOR.h + 0.06);
    // the leaf, hinged on the south jamb and standing open into the parlour
    const pivot = new THREE.Group(); pivot.position.set(W / 2 - 0.02, 0, DOOR.z + DOOR.w / 2); pivot.rotation.y = -Math.PI / 2 + 1.75; G.add(pivot);
    const leaf = F.rbox(DOOR.w - 0.02, DOOR.h - 0.04, 0.05, wood, 0.006); leaf.position.set(-DOOR.w / 2, DOOR.h / 2, 0); leaf.castShadow = true; pivot.add(leaf);
    for (const y of [0.55, 1.5]) { const panel = F.rbox(DOOR.w - 0.3, 0.7, 0.015, M.walnut({ tint: '#3a2418' }), 0.004); panel.position.set(-DOOR.w / 2, y, 0.03); pivot.add(panel); }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), M.brass()); knob.position.set(-DOOR.w + 0.1, 1.0, 0.05); pivot.add(knob);
    // the jamb linings through the wall's thickness
    for (const z of [DOOR.z - DOOR.w / 2 - 0.01, DOOR.z + DOOR.w / 2 + 0.01]) { const j = F.rbox(0.3, DOOR.h, 0.02, wood, 0.004); j.position.set(W / 2 + 0.13, DOOR.h / 2, z); S.add(j); }
    const lintelIn = F.rbox(0.3, 0.02, DOOR.w + 0.04, wood, 0.004); lintelIn.position.set(W / 2 + 0.13, DOOR.h, DOOR.z); S.add(lintelIn);
    // the hall beyond: a short passage papered like the hall, a dado and skirting, the hall's tiles, a ceiling, and a wall
    // lamp on its far wall, so the way out is a warm, real place rather than a lit slab
    this._buildPassage();
    const spill = new THREE.PointLight('#ffb070', 1.2, 2.6, 2); spill.position.set(W / 2 - 0.4, 1.4, DOOR.z); G.add(spill);
    const back = this._proxy(0.3, DOOR.h, DOOR.w, [W / 2 + 0.2, DOOR.h / 2, DOOR.z]);
    this._hs({ id: 'parlour.back', object: back, label: 'Back to the hall', highlight: false, onClick: () => this._leave() });
    // the door is behind you, so its light is the way out you can see: the hall lamp throws a warm fan through the opening
    // along the south wall, over the sideboard, into the left of the default view. It is a second way back to the hall.
    const fan = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), new THREE.MeshBasicMaterial({ map: hallFanTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    fan.position.set(-0.95, 1.75, D / 2 - 0.012); fan.rotation.y = Math.PI; fan.renderOrder = 1; fan.userData.noRaycast = true; G.add(fan);
    const fanProxy = this._proxy(2.6, 1.5, 0.06, [-0.95, 1.7, D / 2 - 0.05]);
    this._hs({ id: 'parlour.back.light', object: fanProxy, label: 'Light from the hall door, behind you', highlight: false, onClick: () => this._leave() });
  }
  _buildPassage() {
    const G = this.group;
    const X0 = W / 2 + 0.28, LEN = 1.5, X1 = X0 + LEN, HW = DOOR.w / 2 + 0.02, PH = 2.45;
    const zc = DOOR.z, xc = (X0 + X1) / 2;
    const paper = wallpaperTexture({ base: '#4a3a44', motif: '#5e4a56', seed: 3 }); // the hall's own paper
    paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
    const papered = (w, h) => { const t = paper.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, h / 1.2); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }); };
    const dadoM = M.walnut({ tint: '#3a2418' }), railM = M.walnut();
    const wall = (len, cx, cz, ry) => {
      const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; g.userData.keep = true; G.add(g);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, PH), papered(len, PH)); m.position.y = PH / 2; m.receiveShadow = true; g.add(m);
      const dado = F.rbox(len, 1.0, 0.02, dadoM, 0.004); dado.position.set(0, 0.5, 0.01); g.add(dado);
      for (const x of [-len / 4, len / 4]) { if (len < 1.2) break; const p = F.rbox(len / 2 - 0.16, 0.6, 0.012, M.walnut({ tint: '#4a2f1e' }), 0.003); p.position.set(x, 0.52, 0.024); g.add(p); }
      const rail = F.rbox(len, 0.05, 0.045, railM, 0.01); rail.position.set(0, 1.0, 0.022); g.add(rail);
      const skirt = F.rbox(len, 0.16, 0.035, M.walnut({ tint: '#2a1a12' }), 0.006); skirt.position.set(0, 0.08, 0.018); g.add(skirt);
      const picture = F.rbox(len, 0.03, 0.03, railM, 0.006); picture.position.set(0, PH - 0.12, 0.015); g.add(picture);
      return g;
    };
    wall(LEN, xc, zc - HW, 0);                 // north side, facing into the passage
    const south = wall(LEN, xc, zc + HW, Math.PI); // south side: the one seen through the door from the room
    const end = wall(HW * 2 + 0.6, X1, zc, -Math.PI / 2); // the far wall, the hall's own wall across the way
    // the tiles of the hall underfoot, and a plaster ceiling
    const tiles = tileTexture({ a: '#15110f', b: '#b7ab96' }); tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(LEN / 0.6, (HW * 2) / 0.6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 0.02, HW * 2), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.35, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(xc, 0.003, zc); floor.receiveShadow = true; G.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 0.02, HW * 2), M.plaster({ tint: '#4a3d3a', repeat: [1, 1] })); ceil.rotation.x = Math.PI / 2; ceil.position.set(xc, PH, zc); G.add(ceil);
    // the wall lamp on the south side, where it shows through the door: a brass back-plate, an arm, a frosted shade
    const lamp = new THREE.Group(); lamp.position.set(0.15, 1.72, 0); south.add(lamp);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 18), M.brass()); back.rotation.x = Math.PI / 2; back.position.z = 0.006; lamp.add(back);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), M.brass()); arm.rotation.x = Math.PI / 2; arm.position.set(0, 0, 0.08); lamp.add(arm);
    const cup = F.lathe([[0.02, 0], [0.035, 0.015], [0.04, 0.03], [0, 0.03]], M.brass(), 14); cup.position.set(0, -0.01, 0.16); lamp.add(cup);
    const shade = F.lathe([[0.04, 0], [0.075, 0.06], [0.085, 0.12], [0.06, 0.15], [0.03, 0.155]], new THREE.MeshStandardMaterial({ color: '#f4e4c8', emissive: '#ffb064', emissiveIntensity: 1.6, roughness: 0.6, side: THREE.DoubleSide }), 20);
    shade.position.set(0, 0.02, 0.16); lamp.add(shade);
    const glow = new THREE.PointLight('#ffb070', 2.6, 4.5, 2); glow.position.set(0, 0.1, 0.35); lamp.add(glow);
    // a small dark picture on the far wall, so it reads as a wall in a house
    const pic = F.pictureFrame({ w: 0.34, h: 0.44, border: 0.04, style: 'gilt', px: 256, draw: (g, w, h) => drawPortrait(g, w, h) });
    pic.position.set(-0.32, 1.6, 0.02); end.add(pic);
    // a little light from the hall itself, round the corner, so the passage is not one lamp's pool
    const fill = new THREE.PointLight('#d89060', 0.8, 3, 2); fill.position.set(X0 + 0.4, 2.0, zc); G.add(fill);
  }
  /** A close-up's caption, once any line over it (the house's first-close-up line, say) has been dismissed. */
  async _captionWhenQuiet(key, scope, onShown) {
    const { ctx } = this;
    const here = () => ctx.game.currentRoom === this && ctx.camera.inFocus && ctx.camera.scope === scope;
    await ctx.tween.delay(0.3);
    while (here() && (ctx.dialogue.isOpen || ctx.dialogue.busy)) await ctx.tween.delay(0.25);
    if (!here()) return;
    onShown?.();
    ctx.dialogue.caption(key, { duration: 6, scope });
  }
  /** Out to the hall: turn to the door (so the way out is seen even from the far side of the room), a step, then go. */
  async _leave() {
    const { ctx } = this;
    if (this._leaving) return;
    this._leaving = true;
    try {
      if (ctx.camera.inFocus) await ctx.camera.exitFocus();
      ctx.camera.lookAtPoint(new THREE.Vector3(W / 2 + 0.6, 1.25, DOOR.z));
      ctx.audio.play('footstep', { gain: 0.35, pitch: 0.9 });
      await ctx.tween.delay(0.35);
      ctx.audio.play('footstep', { gain: 0.35, pitch: 0.85 });
      await ctx.tween.delay(0.3);
      await ctx.game.goToRoom('foyer');
    } finally { this._leaving = false; }
  }
  /** HUD Back / Esc with no close-up open (the engine's `room.onBack()`): walk out by the door to the hall. */
  onBack() {
    if (this.ctx.camera.inFocus || this.ctx.dialogue.isOpen || this.ctx.dialogue.busy || this.ctx.hotspots.locked) return false;
    this._leave();
    return true;
  }

  // ───────────────────────────────────────────────── north: the fireplace, the mantel clock, the mirror, the sampler, the lamp
  _buildNorth() {
    const G = this.group, S = this.statics, { ctx } = this;
    const FX = -1.4, Z = -D / 2;
    const marble = M.smoothStone({ color: '#d8d0c4', roughness: 0.35 });
    const dark = M.matte('#0c0907');
    // surround: pilasters, lintel, shelf
    for (const s of [-1, 1]) { const p = F.rbox(0.18, 1.2, 0.2, marble, 0.01); p.position.set(FX + s * 0.62, 0.6, Z + 0.26); p.castShadow = true; S.add(p); const cap = F.rbox(0.22, 0.06, 0.24, marble, 0.01); cap.position.set(FX + s * 0.62, 1.17, Z + 0.26); S.add(cap); }
    const lintel = F.rbox(1.44, 0.22, 0.2, marble, 0.01); lintel.position.set(FX, 1.11, Z + 0.26); S.add(lintel);
    const shelf = F.rbox(1.72, 0.05, 0.36, marble, 0.01); shelf.position.set(FX, 1.275, Z + 0.3); shelf.castShadow = true; S.add(shelf);
    const MANTEL = 1.3;
    // the firebox: a black recess with a cast-iron back, a basket grate, a fire laid and never lit
    const box = F.rbox(1.0, 1.0, 0.4, dark, 0.005); box.position.set(FX, 0.5, Z + 0.2); S.add(box);
    const iron = M.iron({ color: '#2a2a2c', roughness: 0.6 });
    const back = F.rbox(0.9, 0.9, 0.02, iron, 0.004); back.position.set(FX, 0.45, Z + 0.04); S.add(back);
    const grate = new THREE.Group(); grate.position.set(FX, 0, Z + 0.3); S.add(grate);
    for (const z of [-0.12, 0.12]) { const r = F.rbox(0.7, 0.03, 0.03, iron, 0.004); r.position.set(0, 0.2, z); grate.add(r); }
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), iron); b.position.set(-0.3 + i * 0.1, 0.2, 0.13); grate.add(b); }
    for (const x of [-0.32, 0.32]) for (const z of [-0.12, 0.12]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 8), iron); l.position.set(x, 0.1, z); grate.add(l); }
    const bed = F.rbox(0.7, 0.02, 0.26, iron, 0.004); bed.position.set(0, 0.19, 0); grate.add(bed);
    const paperMat = M.parchment({ tint: '#d9ccae' });
    const r = rng(23);
    for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.04 + r() * 0.02, 7, 5), paperMat); p.position.set(-0.22 + i * 0.11, 0.24, (r() - 0.5) * 0.1); p.scale.set(1, 0.7, 1); p.rotation.set(r() * 3, r() * 3, r() * 3); grate.add(p); }
    const stick = M.oak({ tint: '#8a6a3a' });
    for (let i = 0; i < 8; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.3, 5), stick); k.position.set(-0.2 + i * 0.055, 0.28, (r() - 0.5) * 0.06); k.rotation.z = Math.PI / 2 + (r() - 0.5) * 0.3; k.rotation.y = (r() - 0.5) * 0.6; grate.add(k); }
    const log = M.oak({ tint: '#4a3020' });
    for (const [x, y, rz, ry] of [[-0.12, 0.33, 0.1, 0.2], [0.1, 0.33, -0.1, -0.3], [-0.02, 0.4, 0.05, 0.9]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 9), log); l.position.set(x, y, 0); l.rotation.z = Math.PI / 2 + rz; l.rotation.y = ry; l.castShadow = true; grate.add(l); }
    const fireProxy = this._proxy(0.9, 0.7, 0.5, [0, 0.35, 0.05], grate);
    this._hs({ id: 'parlour.fire', object: fireProxy, label: 'The fire, laid', highlight: bed, onClick: () => ctx.dialogue.caption('caption.fire') });
    // hearth, fender, irons
    const hearth = F.rbox(1.7, 0.03, 0.6, M.smoothStone({ color: '#4a4440', roughness: 0.6 }), 0.005); hearth.position.set(FX, 0.015, Z + 0.62); S.add(hearth);
    const fender = new THREE.Group(); fender.position.set(FX, 0, Z + 0.9); S.add(fender);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 10), M.brass()); rail.rotation.z = Math.PI / 2; rail.position.y = 0.16; fender.add(rail);
    for (const x of [-0.7, 0.7]) { const side = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), M.brass()); side.rotation.x = Math.PI / 2; side.position.set(x, 0.16, -0.16); fender.add(side); for (const z of [0, -0.32]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.16, 10), M.brass()); post.position.set(x, 0.08, z); fender.add(post); } }
    const stand = new THREE.Group(); stand.position.set(FX + 0.95, 0, Z + 0.4); S.add(stand);
    const sb = F.lathe([[0.1, 0], [0.1, 0.02], [0.03, 0.03], [0.015, 0.7], [0.03, 0.72], [0, 0.72]], M.brass(), 14); stand.add(sb);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 6), iron); t.position.set(Math.cos(i * 2.1) * 0.05, 0.4, Math.sin(i * 2.1) * 0.05); t.rotation.z = (i - 1) * 0.08; stand.add(t); }
    // the bell-pull on the west side of the chimney breast
    const pull = new THREE.Group(); pull.position.set(FX - 1.15, 0, Z + 0.05); G.add(pull);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 6), M.velvet({ color: '#6a2a2e' })); cord.position.y = 2.2; pull.add(cord);
    const tassel = F.lathe([[0.01, 0], [0.035, 0.03], [0.04, 0.1], [0.02, 0.12], [0.012, 0.14], [0, 0.14]], M.velvet({ color: '#8a3a3e' }), 12); tassel.position.y = 1.56; pull.add(tassel);
    const pproxy = this._proxy(0.12, 1.2, 0.1, [0, 2.1, 0], pull);
    this._hs({ id: 'parlour.bellpull', object: pproxy, label: 'Bell-pull', highlight: tassel, onClick: () => { ctx.dialogue.caption('caption.bellpull'); ctx.tween.to(tassel.position, { y: 1.5 }, { duration: 0.2, ease: 'outQuad' }).then(() => ctx.tween.to(tassel.position, { y: 1.56 }, { duration: 0.5, ease: 'outBack' })); } });
    // the mirror over the mantel: gilt, and glass that keeps the room
    const mirror = F.pictureFrame({ w: 0.95, h: 1.15, border: 0.08, style: 'gilt', texture: noiseTexture({ scale: 2, seed: 3 }) });
    mirror.position.set(FX, 2.0, Z + 0.05); G.add(mirror);
    mirror.userData.canvas.material = new THREE.MeshStandardMaterial({ color: '#8a9098', metalness: 1, roughness: 0.06, envMapIntensity: 1.8 });
    this._hs({ id: 'parlour.mirror', object: mirror, label: 'Mirror', onClick: () => ctx.dialogue.caption('caption.mirror') });
    // the sampler, east of the chimney breast
    const sampler = F.pictureFrame({ w: 0.46, h: 0.38, border: 0.035, style: 'walnut', px: 512, draw: (g, w, h) => drawSampler(g, w, h) });
    sampler.position.set(FX + 1.65, 1.95, Z + 0.03); G.add(sampler);
    this._hs({ id: 'parlour.sampler', object: sampler, label: 'Sampler', onClick: () => ctx.dialogue.caption('caption.sampler.parlour') });
    // the gas lamp, turned down
    const lamp = new THREE.Group(); lamp.position.set(0.6, 1.9, Z + 0.02); G.add(lamp);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), M.brass()); arm.rotation.x = Math.PI / 2; arm.position.set(0, 0, 0.15); lamp.add(arm);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16), M.brass()); plate.rotation.x = Math.PI / 2; lamp.add(plate);
    const cup = F.lathe([[0.02, 0], [0.04, 0.02], [0.045, 0.05], [0.07, 0.07], [0, 0.07]], M.brass(), 16); cup.position.set(0, 0.02, 0.3); lamp.add(cup);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 14), new THREE.MeshStandardMaterial({ color: '#f0e0c8', emissive: '#ffa858', emissiveIntensity: 0.9, roughness: 0.6, transparent: true, opacity: 0.85 })); globe.position.set(0, 0.14, 0.3); lamp.add(globe);
    const key = F.rbox(0.03, 0.008, 0.012, M.brass(), 0.002); key.position.set(0.03, 0, 0.22); lamp.add(key);
    this._hs({ id: 'parlour.gaslamp', object: globe, label: 'Gas lamp', onClick: () => ctx.dialogue.caption('caption.gaslamp') });
    // the mantel clock under its dome, and the things beside it
    this._buildMantelClock(FX, MANTEL, Z + 0.3);
    const china = new THREE.MeshStandardMaterial({ color: '#e8e0d4', roughness: 0.3 });
    for (const s of [-1, 1]) { const dog = F.lathe([[0.03, 0], [0.04, 0.02], [0.035, 0.1], [0.045, 0.13], [0.02, 0.16], [0.03, 0.19], [0, 0.2]], china, 12); dog.position.set(FX + s * 0.62, MANTEL, Z + 0.3); S.add(dog); }
    const vase = F.lathe([[0.03, 0], [0.045, 0.03], [0.05, 0.12], [0.03, 0.18], [0.04, 0.22], [0, 0.22]], new THREE.MeshStandardMaterial({ color: '#4a6a8a', roughness: 0.25 }), 14); vase.position.set(FX - 0.38, MANTEL, Z + 0.28); S.add(vase);
    const card = F.rbox(0.09, 0.12, 0.003, M.parchment({ tint: '#e0d4b8' }), 0.001); card.position.set(FX + 0.34, MANTEL + 0.06, Z + 0.22); card.rotation.x = -0.15; S.add(card);
  }

  _buildMantelClock(x, y, z) {
    const G = this.group, { ctx } = this;
    const clock = new THREE.Group(); clock.position.set(x, y, z); G.add(clock);
    const ebony = M.matte('#141010', { roughness: 0.4 });
    const plinth = F.rbox(0.3, 0.025, 0.18, ebony, 0.004); plinth.position.y = 0.0125; clock.add(plinth);
    const base = F.rbox(0.22, 0.04, 0.11, M.gold({ roughness: 0.3 }), 0.004); base.position.y = 0.045; clock.add(base);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 28), M.gold({ roughness: 0.3 })); drum.rotation.x = Math.PI / 2; drum.position.set(0, 0.15, 0); clock.add(drum);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 8, 28), M.gold({ roughness: 0.25 })); bezel.position.set(0, 0.15, 0.036); clock.add(bezel);
    const face = makeCanvasPlane(0.15, 0.15, (g, w, h) => drawMantelFace(g, w, h), { px: 512, transparent: true });
    face.position.set(0, 0.15, 0.037); face.material.roughness = 0.5; face.material.emissive = new THREE.Color('#9a7a4a'); face.material.emissiveIntensity = 0; clock.add(face);
    const finial = F.lathe([[0.02, 0], [0.015, 0.02], [0.025, 0.04], [0.01, 0.06], [0, 0.07]], M.gold(), 10); finial.position.set(0, 0.235, 0); clock.add(finial);
    // the dome: a glass bell gone the colour of smoke
    const smoke = new THREE.MeshPhysicalMaterial({ color: '#2a211a', transparent: true, opacity: 0.94, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const dome = new THREE.Group(); dome.position.y = 0.025; clock.add(dome);
    const wallM = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.24, 32, 1, true), smoke); wallM.position.y = 0.12; wallM.renderOrder = 4; dome.add(wallM);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 16, 0, TAU, 0, Math.PI / 2), smoke); cap.position.y = 0.24; cap.renderOrder = 4; dome.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 32), ebony); ring.rotation.x = Math.PI / 2; ring.position.y = 0.012; clock.add(ring);
    this.mantel = { clock, smoke, face };
    const proxy = this._proxy(0.3, 0.4, 0.3, [0, 0.2, 0], clock);
    this._hs({
      id: 'parlour.mantel', object: proxy, label: 'Mantel clock', highlight: drum,
      onClick: async () => {
        const p = clock.localToWorld(new THREE.Vector3(0, 0.16, 0));
        await ctx.camera.focus({ position: [p.x + 0.05, p.y + 0.08, p.z + 0.55], lookAt: p, scope: 'focus:parlour.mantel', fov: 34, onExit: () => ctx.dialogue.hideCaption() });
        ctx.dialogue.caption(this.house.lantern === 'carried' ? 'caption.mantel.lit' : 'caption.mantel.dark', { duration: 7, scope: 'focus:parlour.mantel' });
      },
    });
  }
  /** The dome is opaque smoke until the lantern is held up to it. */
  _syncDome(animated) {
    const lit = this.house.lantern === 'carried';
    const { smoke, face } = this.mantel;
    const to = { opacity: lit ? 0.22 : 0.94 }, fe = { emissiveIntensity: lit ? 0.55 : 0 };
    if (animated) { this.ctx.tween.to(smoke, to, { duration: 1.4 }); this.ctx.tween.to(face.material, fe, { duration: 1.4 }); }
    else { smoke.opacity = to.opacity; face.material.emissiveIntensity = fe.emissiveIntensity; }
  }

  // ───────────────────────────────────────────────── south: the sideboard, the caddy, the gramophone, the hat
  _buildSouth() {
    const G = this.group, S = this.statics, { ctx } = this;
    const Z = D / 2;
    const wood = M.mahogany({ tint: '#4a2218' }), woodD = M.mahogany({ tint: '#3a1a12' });
    const sb = new THREE.Group(); sb.position.set(-0.5, 0, Z - 0.3); S.add(sb);
    const body = F.rbox(1.7, 0.78, 0.5, wood, 0.01); body.position.y = 0.47; body.castShadow = true; sb.add(body);
    const top = F.rbox(1.78, 0.04, 0.56, woodD, 0.008); top.position.y = 0.88; sb.add(top);
    for (const x of [-0.42, 0.42]) { const d = F.rbox(0.72, 0.5, 0.015, woodD, 0.004); d.position.set(x, 0.42, -0.255); sb.add(d); const k = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), M.brass()); k.position.set(x + (x < 0 ? 0.3 : -0.3), 0.42, -0.27); sb.add(k); }
    for (const x of [-0.42, 0.42]) { const d = F.rbox(0.72, 0.12, 0.015, woodD, 0.004); d.position.set(x, 0.76, -0.255); sb.add(d); const k = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), M.brass()); k.position.set(x, 0.76, -0.27); sb.add(k); }
    for (const x of [-0.78, 0.78]) for (const z of [-0.2, 0.2]) { const l = F.lathe([[0.03, 0], [0.035, 0.02], [0.02, 0.04], [0.03, 0.08], [0, 0.08]], woodD, 10); l.position.set(x, 0, z); sb.add(l); }
    const runner = F.rbox(1.2, 0.004, 0.36, M.velvet({ color: '#d8ccb0' }), 0.001); runner.position.set(0, 0.902, 0); sb.add(runner);
    const TOP = 0.9;
    // the caddy at the door end, nearest the player, so the gramophone does not stand in front of it from the door
    this._buildCaddy(sb, 0.52, TOP, -0.02);
    this._buildGramophone(sb, -0.52, TOP, 0.02);
    // a decanter and two glasses on a tray
    const tray = F.lathe([[0, 0], [0.14, 0], [0.15, 0.015], [0.14, 0.02], [0, 0.02]], M.brass({ color: '#9a8a5a' }), 20); tray.position.set(0.0, TOP, 0.1); sb.add(tray);
    const glassM = M.glass({ color: '#d8e0d0', opacity: 0.3 });
    const decanter = F.lathe([[0.04, 0], [0.05, 0.03], [0.05, 0.1], [0.02, 0.14], [0.015, 0.2], [0.022, 0.22], [0, 0.22]], glassM, 16); decanter.position.set(-0.03, TOP + 0.02, 0.1); decanter.renderOrder = 3; sb.add(decanter);
    for (const x of [0.07, 0.11]) { const gl = F.lathe([[0.02, 0], [0.025, 0.01], [0.012, 0.03], [0.012, 0.06], [0.03, 0.08], [0.032, 0.11], [0, 0.11]], glassM, 12); gl.position.set(x, TOP + 0.02, 0.1 + (x - 0.09) * 1.5); gl.renderOrder = 3; sb.add(gl); }
    // the hat on its stand, in the south-east corner
    const stand = new THREE.Group(); stand.position.set(2.3, 0, Z - 0.5); S.add(stand);
    const pole = F.lathe([[0.16, 0], [0.16, 0.025], [0.04, 0.04], [0.025, 1.5], [0.035, 1.56], [0.06, 1.6], [0, 1.6]], M.walnut({ tint: '#2a1a12' }), 14); stand.add(pole);
    const felt = new THREE.MeshStandardMaterial({ color: '#3a2238', roughness: 1, bumpMap: noiseTexture({ scale: 30, seed: 44 }), bumpScale: 0.3 });
    const hat = new THREE.Group(); hat.position.set(0, 1.58, 0); hat.rotation.z = 0.12; stand.add(hat);
    const brim = F.lathe([[0.03, 0], [0.19, 0.0], [0.2, 0.012], [0.03, 0.012]], felt, 24); hat.add(brim);
    const crown = F.lathe([[0.11, 0.012], [0.105, 0.1], [0.09, 0.13], [0, 0.135]], felt, 20); hat.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.025, 20, 1, true), M.velvet({ color: '#8a7a5a' })); band.position.y = 0.035; hat.add(band);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.006, 8), M.matte('#050305')); hole.position.set(0.095, 0.075, 0.06); hole.rotation.y = 1.0; hat.add(hole);
    const hproxy = this._proxy(0.44, 0.2, 0.44, [0, 0.07, 0], hat);
    this._hs({ id: 'parlour.hat', object: hproxy, label: 'A hat', highlight: crown, onClick: () => ctx.dialogue.caption('caption.hat') });
  }

  _buildGramophone(parent, x, y, z) {
    const { ctx } = this;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -0.25; g.userData.keep = true; parent.add(g);
    const oak = M.oak({ tint: '#6a4020' });
    const box = F.rbox(0.34, 0.16, 0.34, oak, 0.008); box.position.y = 0.08; box.castShadow = true; g.add(box);
    const lid = F.rbox(0.35, 0.02, 0.35, M.oak({ tint: '#5a3418' }), 0.006); lid.position.y = 0.17; g.add(lid);
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 28), M.velvet({ color: '#2a5a3a' })); platter.position.set(0, 0.185, 0); g.add(platter);
    const record = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.004, 28), new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.35, metalness: 0.1 })); record.position.set(0, 0.192, 0); g.add(record);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 16), M.matte('#8a2a2a')); label.position.set(0, 0.193, 0); g.add(label);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 8), M.brass()); spindle.position.set(0, 0.2, 0); g.add(spindle);
    // the tone arm, resting; the crank; the horn
    const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.04, 12), M.brass()); armBase.position.set(0.14, 0.2, 0.12); g.add(armBase);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), M.brass()); arm.position.set(0.09, 0.22, 0.08); arm.rotation.z = Math.PI / 2; arm.rotation.y = 0.6; g.add(arm);
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 8), M.iron({ color: '#444' })); crank.position.set(0.17, 0.1, -0.05); crank.rotation.z = Math.PI / 2; g.add(crank);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), M.oak({ tint: '#2a1a10' })); grip.position.set(0.25, 0.1, -0.05); grip.rotation.x = Math.PI / 2; grip.position.z += 0.025; g.add(grip);
    const horn = F.lathe([[0.02, 0], [0.025, 0.1], [0.04, 0.22], [0.08, 0.32], [0.15, 0.4], [0.22, 0.45], [0.23, 0.46], [0.2, 0.45], [0.13, 0.4], [0.07, 0.31], [0.035, 0.2], [0.018, 0.08], [0.0, 0.02]], new THREE.MeshStandardMaterial({ color: '#8a6a30', metalness: 0.75, roughness: 0.5, roughnessMap: noiseTexture({ scale: 8, seed: 63, bias: 0.6 }) }), 28);
    horn.position.set(-0.05, 0.19, -0.04); horn.rotation.x = -1.1; horn.rotation.z = 0.55; horn.castShadow = true; g.add(horn);
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 14, Math.PI / 2), M.brass()); elbow.position.set(-0.05, 0.19, -0.02); elbow.rotation.y = Math.PI / 2; g.add(elbow);
    const proxy = this._proxy(0.36, 0.5, 0.36, [-0.02, 0.28, -0.04], g);
    this._hs({ id: 'parlour.gramophone', object: proxy, label: 'Gramophone', highlight: horn, onClick: () => { ctx.dialogue.caption('caption.gramophone'); ctx.audio.play('ratchet', { gain: 0.3, pitch: 0.7 }); ctx.tween.to(crank.rotation, { x: crank.rotation.x + TAU }, { duration: 1.2, ease: 'inOutSine' }); } });
  }

  // ───────────────────────────────────────────────── the tea caddy: lock P1
  _buildCaddy(parent, x, y, z) {
    const { ctx } = this;
    const rose = M.mahogany({ tint: '#5a2a24' }), roseD = M.mahogany({ tint: '#3a1a16' });
    const lead = new THREE.MeshStandardMaterial({ color: '#a8aab0', metalness: 0.5, roughness: 0.5, roughnessMap: noiseTexture({ scale: 10, seed: 52, bias: 0.7 }) });
    const CW = 0.24, CH = 0.13, CD = 0.16, T = 0.012;
    const caddy = new THREE.Group(); caddy.position.set(x, y, z); caddy.rotation.y = Math.PI; caddy.userData.keep = true; parent.add(caddy); // it moves: keep it out of the static merge
    // a hollow box: bottom and four sides, lined in lead foil
    const bottom = F.rbox(CW, T, CD, rose, 0.003); bottom.position.y = T / 2; caddy.add(bottom);
    const lining = F.rbox(CW - T * 2 - 0.004, 0.002, CD - T * 2 - 0.004, lead, 0.001); lining.position.y = T + 0.001; caddy.add(lining);
    for (const s of [-1, 1]) {
      const side = F.rbox(T, CH, CD, rose, 0.003); side.position.set(s * (CW / 2 - T / 2), CH / 2, 0); caddy.add(side);
      const fb = F.rbox(CW, CH, T, s < 0 ? rose : rose, 0.003); fb.position.set(0, CH / 2, s * (CD / 2 - T / 2)); caddy.add(fb);
    }
    for (const s2 of [-1, 1]) { const a = F.rbox(CW + 0.004, 0.006, 0.004, M.brass({ color: '#c0a060' }), 0.001); a.position.set(0, CH - 0.02, s2 * (CD / 2)); caddy.add(a); const b = F.rbox(0.004, 0.006, CD + 0.004, M.brass({ color: '#c0a060' }), 0.001); b.position.set(s2 * (CW / 2), CH - 0.02, 0); caddy.add(b); }
    const feet = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), M.brass()); f.position.set(sx * (CW / 2 - 0.02), 0, sz * (CD / 2 - 0.02)); caddy.add(f); feet.push(f); }
    // the lid, hinged at the back
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, CH, -CD / 2); caddy.add(lidPivot);
    const lid = F.rbox(CW, 0.022, CD, roseD, 0.004); lid.position.set(0, 0.011, CD / 2); lidPivot.add(lid);
    const lidTop = F.rbox(CW - 0.05, 0.01, CD - 0.05, rose, 0.003); lidTop.position.set(0, 0.026, CD / 2); lidPivot.add(lidTop);
    const lidKnob = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), M.brass()); lidKnob.position.set(0, 0.04, CD / 2); lidPivot.add(lidKnob);
    const lidLining = F.rbox(CW - T * 2, 0.002, CD - T * 2, lead, 0.001); lidLining.position.set(0, -0.001, CD / 2); lidPivot.add(lidLining);
    // the lock: a brass clock face on the front, two hands, a keyhole the size of a pin
    const FZ = CD / 2, FY = 0.07;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.005, 32), M.brass({ polished: true })); disc.rotation.x = Math.PI / 2; disc.position.set(0, FY, FZ + 0.0025); caddy.add(disc);
    const faceP = makeCanvasPlane(0.084, 0.084, (g, w, h) => drawCaddyFace(g, w, h), { px: 512, transparent: true }); faceP.position.set(0, FY, FZ + 0.0055); faceP.material.roughness = 0.7; faceP.material.metalness = 0; caddy.add(faceP);
    // a thin brass rule down the face: left of it is the short hand's half, right of it the long hand's
    const divider = F.rbox(0.0014, 0.08, 0.0012, M.brass({ polished: true }), 0.0003); divider.position.set(0, FY, FZ + 0.0066); caddy.add(divider);
    const keyhole = F.rbox(0.003, 0.009, 0.004, M.matte('#050302'), 0.0005); keyhole.position.set(0, FY - 0.033, FZ + 0.007); caddy.add(keyhole);
    const handMat = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.4, metalness: 0.5 });
    const makeHand = (len, w, zOff) => {
      const pivot = new THREE.Group(); pivot.position.set(0, FY, FZ + zOff); caddy.add(pivot);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.0016), handMat); shaft.position.y = len / 2 - 0.004; pivot.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 1.6, 0.008, 4), handMat); tip.position.y = len - 0.004; tip.rotation.y = Math.PI / 4; pivot.add(tip);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(w * 1.3, w * 1.3, 0.002, 12), handMat); hub.rotation.x = Math.PI / 2; pivot.add(hub);
      return pivot;
    };
    const hour = makeHand(0.024, 0.005, 0.008), minute = makeHand(0.036, 0.0035, 0.0105);
    const state = ctx.state.get('parlour.caddy.hands', [0, 0]);
    const hands = { hour, minute, h: state[0], m: state[1] };
    const setHands = () => { hour.rotation.z = -(hands.h / 12) * TAU; minute.rotation.z = -(hands.m / 12) * TAU; };
    setHands();
    // inside: the hatpin across the box, her badge beside it
    const pin = new THREE.Group(); pin.position.set(0.0, T + 0.012, 0.01); pin.rotation.y = 0.35; pin.rotation.z = 0.0; caddy.add(pin);
    const steel = M.iron({ color: '#9a9ea4', roughness: 0.3 });
    const shaftM = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0022, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#c8ccd2', emissive: '#404448', emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.6 })); shaftM.rotation.z = Math.PI / 2; pin.add(shaftM);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), new THREE.MeshStandardMaterial({ color: '#0a0a0e', roughness: 0.15, metalness: 0.3 })); bead.position.x = -0.1; pin.add(bead);
    this._proxy(0.24, 0.05, 0.08, [0, 0.0, 0], pin);
    const badge = new THREE.Group(); badge.position.set(0.055, T + 0.004, -0.035); badge.rotation.y = -0.4; caddy.add(badge);
    const bdisc = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 28), M.brass({ polished: true })); badge.add(bdisc);
    const bface = makeCanvasPlane(0.054, 0.054, (g, w, h) => drawBadge203(g, w, h), { px: 512, transparent: true }); bface.rotation.x = -Math.PI / 2; bface.position.y = 0.0025; bface.material.roughness = 0.5; bface.material.metalness = 0; bface.material.emissive = new THREE.Color('#6a4a18'); bface.material.emissiveIntensity = 0.35; badge.add(bface);
    const bpin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.003), steel); bpin.position.set(0, -0.001, 0.0); badge.add(bpin);
    const bproxy = this._proxy(0.07, 0.03, 0.07, [0, 0.01, 0], badge);
    const cutLight = new THREE.PointLight('#ffe0b0', 0.0, 0.5, 2); cutLight.position.set(0, FY + 0.06, FZ + 0.16); caddy.add(cutLight);
    const pool = new THREE.PointLight('#ffcf90', 0.9, 1.1, 2); pool.position.set(0, CH + 0.35, CD / 2 + 0.2); caddy.add(pool); // so it reads from the door
    const inLight = new THREE.PointLight('#ffd9a0', 0.0, 0.5, 2); inLight.position.set(0.04, CH + 0.16, -0.04); caddy.add(inLight);
    this.caddy = { group: caddy, lidPivot, hands, setHands, pin, badge, cutLight, inLight, faceP };

    const faceW = () => caddy.localToWorld(new THREE.Vector3(0, FY, FZ));
    const pose = () => {
      const f = faceW();
      return this.house.isOpen('caddy')
        ? { position: [f.x + 0.01, f.y + 0.44, f.z - 0.14], lookAt: [f.x, f.y - 0.07, f.z + 0.07], fov: 40 }
        : { position: [f.x, f.y + 0.03, f.z - 0.34], lookAt: [f.x, f.y - 0.002, f.z], fov: 30 };
    };
    const onOpen = async (verb) => {
      ctx.audio.play('unlock', { gain: 0.6, pitch: 1.4 });
      if (verb !== 'force') { hands.h = CADDY_SOLUTION[0]; hands.m = CADDY_SOLUTION[1]; setHands(); ctx.state.set('parlour.caddy.hands', [hands.h, hands.m]); }
      await ctx.tween.delay(0.25);
      ctx.audio.play('drawerOpen', { gain: 0.4, pitch: 1.3 });
      ctx.tween.to(inLight, { intensity: 0.3 }, { duration: 0.8 });
      await ctx.tween.to(lidPivot.rotation, { x: -1.95 }, { duration: 0.8, ease: 'outBack' });
      if (ctx.camera.inFocus && ctx.camera.scope === 'focus:parlour.caddy') await ctx.camera.refocus(pose());
    };
    const focus = () => {
      this._closeUp(true); pool.intensity = 0;
      const move = ctx.camera.focus({ ...pose(), scope: 'focus:parlour.caddy', onExit: () => { this.house.blurLock(); cutLight.intensity = 0; pool.intensity = 0.9; this._closeUp(false); ctx.dialogue.hideCaption(); } });
      // the Ring button comes up with the move, not after it (build-api: focusLock before awaiting camera.focus)
      const ok = this.house.focusLock('caddy', { onOpen, stay: true });
      return move.then(() => {
        if (!ok) return false;
        cutLight.intensity = 0.12;
        // the first time the dial is seen shut: which half turns which hand
        if (!this.house.isOpen('caddy') && !ctx.state.get('parlour.caddy.taught')) this._captionWhenQuiet('caption.caddy.dial', 'focus:parlour.caddy', () => ctx.state.set('parlour.caddy.taught', true));
        return ok;
      });
    };
    const force = async () => {
      if (this.house.isOpen('caddy')) return;
      if (!ctx.camera.inFocus || ctx.camera.scope !== 'focus:parlour.caddy') await focus();
      this.house.open('caddy', 'force', { onOpen, stay: true });
    };
    const inCaddy = () => ctx.camera.inFocus && ctx.camera.scope === 'focus:parlour.caddy';
    // from the room: the whole caddy and a hand's width round it, so it is not a pixel hunt at the end of the sideboard
    const bodyProxy = this._proxy(0.5, 0.64, 0.62, [0, 0.13, 0.08], caddy); // proud of the sideboard edge, >= 60x60 px at 800x450 from the door (measured)
    this._hs({
      id: 'parlour.caddy', object: bodyProxy, label: () => (this.house.isOpen('caddy') ? 'The tea caddy' : 'The tea caddy, locked'), highlight: lid,
      onClick: () => focus(),
      useItem: { bonekey: force, hatpin: () => ctx.dialogue.caption('caption.nope'), '*': () => ctx.dialogue.caption('caption.nope') },
    });
    // in the close-up, while shut: the box itself takes the key (the two hand zones sit just in front of it)
    const shutProxy = this._proxy(CW + 0.02, CH + 0.03, CD + 0.02, [0, CH / 2, 0], caddy);
    this._hs({
      id: 'parlour.caddy.box', object: shutProxy, label: 'The tea caddy, locked', scope: 'focus:parlour.caddy', highlight: false,
      enabled: () => !this.house.isOpen('caddy'),
      onClick: () => {},
      useItem: { bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    const click = (which) => {
      if (this.house.isOpen('caddy')) return;
      if (which === 'hour') hands.h = (hands.h + 1) % 12; else hands.m = (hands.m + 1) % 12;
      ctx.audio.play('ratchet', { gain: 0.4, pitch: which === 'hour' ? 1.1 : 1.5 });
      setHands();
      ctx.state.set('parlour.caddy.hands', [hands.h, hands.m]);
      if (hands.h === CADDY_SOLUTION[0] && hands.m === CADDY_SOLUTION[1]) this.house.open('caddy', 'pick', { onOpen, stay: true });
    };
    // two fixed click zones on the face: left half turns the short hand, right half the long one; the hands only show
    const zoneZ = CD / 2 + 0.016;
    const hourZone = this._proxy(0.05, 0.1, 0.012, [-0.025, FY, zoneZ], caddy);
    const minuteZone = this._proxy(0.05, 0.1, 0.012, [0.025, FY, zoneZ], caddy);
    this._hs({ id: 'parlour.caddy.hour', object: hourZone, label: 'Short hand', scope: 'focus:parlour.caddy', highlight: hour.children[0], enabled: () => !this.house.isOpen('caddy'), onClick: () => click('hour'), useItem: { bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') } });
    this._hs({ id: 'parlour.caddy.minute', object: minuteZone, label: 'Long hand', scope: 'focus:parlour.caddy', highlight: minute.children[0], enabled: () => !this.house.isOpen('caddy'), onClick: () => click('minute'), useItem: { bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') } });
    this._hs({
      id: 'parlour.hatpin', object: pin, label: 'Hatpin', scope: ['focus:parlour.caddy', 'room'], highlight: shaftM,
      enabled: () => this.house.isOpen('caddy') && this.house.s.items.hatpin === 'away',
      onClick: async () => { if (!this.house.take('hatpin', { from: pin })) return; pin.visible = false; await ctx.dialogue.say('react.hatpin.found'); },
    });
    this._hs({
      id: 'parlour.badge', object: bproxy, label: 'Her badge', scope: ['focus:parlour.caddy', 'room'], highlight: bdisc,
      enabled: () => this.house.isOpen('caddy'),
      onClick: async () => {
        const p = badge.getWorldPosition(new THREE.Vector3()); p.y += 0.004;
        // the same close-up, moved in (not nested), so one Back leaves the caddy
        if (!inCaddy()) { await focus(); if (!inCaddy()) return; }
        this._closeUp(true);
        await ctx.camera.refocus({ position: [p.x + 0.01, p.y + 0.2, p.z - 0.075], lookAt: p, fov: 30, duration: 0.6 });
        if (!inCaddy() || ctx.game.currentRoom !== this) return; // left while the camera moved: no late line
        ctx.dialogue.caption('react.badge', { duration: 7, scope: 'focus:parlour.caddy' });
      },
    });
  }

  // ───────────────────────────────────────────────── centre: the card table laid for four
  _buildTable() {
    const S = this.statics, G = this.group, { ctx } = this;
    const TX = -0.7, TZ = 0.1, TOP = 0.74;
    const walnut = M.walnut({ tint: '#3a2418' });
    const table = F.table({ w: 0.95, d: 0.95, h: TOP, material: walnut, legs: 'turned' }); table.position.set(TX, 0, TZ); S.add(table);
    const baize = F.rbox(0.86, 0.008, 0.86, M.velvet({ color: '#2a5a38' }), 0.003); baize.position.set(TX, TOP + 0.004, TZ); S.add(baize);
    // four chairs, one a side
    const seatM = M.velvet({ color: '#8a4a52' });
    for (const [dx, dz, yaw] of [[0.9, 0.5, -Math.PI / 2 - 0.9], [-0.68, 0, Math.PI / 2], [0, 0.68, Math.PI], [0, -0.68, 0]]) {
      const c = new THREE.Group(); c.position.set(TX + dx, 0, TZ + dz); c.rotation.y = yaw; S.add(c);
      const seat = F.rbox(0.42, 0.05, 0.42, seatM, 0.015); seat.position.y = 0.45; c.add(seat);
      const frame = F.rbox(0.44, 0.04, 0.44, walnut, 0.006); frame.position.y = 0.41; c.add(frame);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = F.lathe([[0.022, 0], [0.018, 0.1], [0.024, 0.2], [0.016, 0.3], [0.02, 0.39]], walnut, 10); l.position.set(sx * 0.18, 0, sz * 0.18); c.add(l); }
      for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.5, 8), walnut); post.position.set(sx * 0.17, 0.68, -0.19); post.rotation.x = -0.08; c.add(post); }
      const top = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 8, 20, Math.PI), walnut); top.position.set(0, 0.9, -0.21); c.add(top);
      const splat = F.rbox(0.09, 0.3, 0.012, walnut, 0.004); splat.position.set(0, 0.73, -0.2); splat.rotation.x = -0.08; c.add(splat);
    }
    // the four cards, in a row facing the door: two, three, ace, three, left to right as the player sees them
    const CARDS = [['2', '♥'], ['3', '♠'], ['A', '♦'], ['3', '♣']];
    const row = new THREE.Group(); row.position.set(TX + 0.18, TOP + 0.009, TZ); row.rotation.y = Math.PI / 2; G.add(row);
    CARDS.forEach(([rank, suit], i) => {
      const card = makeCanvasPlane(0.063, 0.088, (g, w, h) => drawCard(g, w, h, rank, suit), { px: 256 });
      card.rotation.x = -Math.PI / 2; card.position.set((i - 1.5) * 0.2, 0, 0); card.rotation.z = (i - 1.5) * -0.05; card.material.roughness = 0.6; row.add(card);
    });
    const cproxy = this._proxy(0.9, 0.06, 0.14, [0, 0.0, 0], row);
    this._hs({
      id: 'parlour.cards', object: cproxy, label: 'Four cards', highlight: row.children[2],
      onClick: async () => {
        if (ctx.camera.scope !== 'focus:parlour.cards') await ctx.camera.focus({ position: [TX + 0.75, TOP + 0.5, TZ], lookAt: [TX + 0.12, TOP, TZ], scope: 'focus:parlour.cards', fov: 42, onExit: () => ctx.dialogue.hideCaption() });
        ctx.dialogue.caption('caption.cards', { duration: 5, scope: 'focus:parlour.cards' });
      },
    });
    // a score pad and a pencil, and the place the lantern goes
    const pad = F.rbox(0.09, 0.006, 0.12, M.parchment({ tint: '#e8dcbe' }), 0.001); pad.position.set(TX - 0.25, TOP + 0.012, TZ + 0.28); pad.rotation.y = 0.3; S.add(pad);
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6), M.matte('#c9a24a')); pencil.rotation.z = Math.PI / 2; pencil.rotation.y = 0.5; pencil.position.set(TX - 0.22, TOP + 0.013, TZ + 0.2); S.add(pencil);
    const lantern = lanternProp(); lantern.position.set(TX - 0.22, TOP + 0.008, TZ - 0.1); lantern.visible = false; G.add(lantern);
    this.tableLantern = lantern;
    this.table = { x: TX, z: TZ, top: TOP };
  }

  // ───────────────────────────────────────────────── west: the bay, the shutters, the bar and its lever lock
  _buildBay() {
    const G = this.group, S = this.statics, { ctx } = this;
    const X = -W / 2;
    const wood = M.oak({ tint: '#cfc2a4' }), woodD = M.oak({ tint: '#bfb294' });
    // the bay itself, beyond the wall: floor, ceiling, three windows on panelled walls
    const shape = new THREE.Shape(); shape.moveTo(X, -BAY.z0); shape.lineTo(X - BAY.depth, -BAY.inner); shape.lineTo(X - BAY.depth, BAY.inner); shape.lineTo(X, BAY.z0); shape.closePath();
    const flat = new THREE.MeshStandardMaterial({ map: M.floorboards({ tint: '#5a3a24', repeat: [1, 1] }).map, roughness: 0.7, side: THREE.DoubleSide });
    const bfloor = new THREE.Mesh(new THREE.ShapeGeometry(shape), flat); bfloor.rotation.x = Math.PI / 2; bfloor.position.y = 0.002; bfloor.receiveShadow = true; S.add(bfloor);
    const bceil = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.plaster({ tint: '#5a4a44', repeat: [1, 1] })); bceil.material = bceil.material.clone(); bceil.material.side = THREE.DoubleSide; bceil.rotation.x = Math.PI / 2; bceil.position.y = 2.5; S.add(bceil);
    const panel = (cx, cz, len, ry, moon) => {
      const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; S.add(g);
      const wainscot = F.rbox(len, 0.78, 0.04, M.walnut({ tint: '#4a2f1e' }), 0.004); wainscot.position.set(0, 0.39, 0.02); g.add(wainscot);
      const above = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.3), this.wallMat); above.position.set(0, 2.35, 0); g.add(above);
      const win = F.windowFrame({ w: len - 0.22, h: 1.42, arch: false, panes: [2, 3], frameMaterial: M.walnut({ tint: '#3a2418' }), sill: true, rain: 0.5, moonlight: false, skyTop: '#05081a', skyBottom: '#17224a', moon: moon || [4, 4] });
      win.position.set(0, 0.78, 0.0); win.userData.keep = true; g.add(win);
      for (const s of [-1, 1]) { const stile = F.rbox(0.11, 2.5, 0.06, M.walnut({ tint: '#4a2f1e' }), 0.006); stile.position.set(s * (len / 2 - 0.055), 1.25, 0.03); g.add(stile); }
      return g;
    };
    const ang = Math.atan2(BAY.z0 - BAY.inner, BAY.depth);
    const sideLen = Math.hypot(BAY.depth, BAY.z0 - BAY.inner);
    panel(X - BAY.depth + 0.02, 0, BAY.inner * 2, Math.PI / 2, [0.5, 0.72]);
    panel(X - BAY.depth / 2 + 0.01, -(BAY.inner + BAY.z0) / 2 + 0.01, sideLen, Math.PI / 2 - ang);
    panel(X - BAY.depth / 2 + 0.01, (BAY.inner + BAY.z0) / 2 - 0.01, sideLen, Math.PI / 2 + ang);
    const bayGlow = new THREE.PointLight('#8fa8ff', 0.6, 4, 2); bayGlow.position.set(X - 0.5, 1.8, 0); G.add(bayGlow);
    // the pelmet and curtains either side of the opening, inside the room
    const velvet = M.velvet({ color: '#6a2a30' });
    const pelmet = F.rbox(BAY.z0 * 2 + 0.3, 0.28, 0.14, velvet, 0.02); pelmet.position.set(X + 0.1, 2.56, 0); pelmet.rotation.y = Math.PI / 2; S.add(pelmet);
    for (const s of [-1, 1]) { const c = F.lathe([[0.12, 0], [0.1, 0.3], [0.13, 1.2], [0.1, 2.0], [0.12, 2.45]], velvet, 12); c.position.set(X + 0.14, 0, s * (BAY.z0 + 0.1)); c.scale.set(1, 1, 0.7); S.add(c); }
    // the shutters: two leaves hinged at the piers, meeting in the middle
    const leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(X + 0.06, 0, s * (BAY.z0 - 0.02)); G.add(pivot);
      const half = BAY.z0 - 0.03;
      const leaf = new THREE.Group(); leaf.position.set(0, 0, -s * half / 2); pivot.add(leaf);
      const board = F.rbox(0.04, 2.3, half, wood, 0.006); board.position.y = 1.27; board.castShadow = true; leaf.add(board);
      for (const [y, h] of [[0.65, 0.78], [1.72, 1.1]]) { const p = F.rbox(0.012, h, half - 0.16, woodD, 0.004); p.position.set(0.026, y, 0); leaf.add(p); if (h > 1) for (let i = 0; i < 9; i++) { const slat = F.rbox(0.012, 0.03, half - 0.22, M.oak({ tint: '#9a8e74' }), 0.002); slat.position.set(0.034, y - 0.48 + i * 0.12, 0); slat.rotation.z = 0.5; leaf.add(slat); } }
      for (const y of [0.3, 1.27, 2.3]) { const h = F.rbox(0.014, 0.08, 0.03, M.iron({ color: '#2a2622' }), 0.002); h.position.set(0.03, y, s * half / 2 - 0.02); leaf.add(h); }
      leaves.push(pivot);
    }
    // the bar across both leaves, in iron brackets; it pivots at the south bracket so it can come down
    const BY = 1.12;
    const bar = new THREE.Group(); bar.position.set(X + 0.13, BY, 1.0); G.add(bar);
    const beam = F.rbox(0.07, 0.09, 2.0, M.oak({ tint: '#4a3018' }), 0.008); beam.position.set(0, 0, -1.0); beam.castShadow = true; bar.add(beam);
    for (const z of [0.1, -2.1]) { const cap = F.rbox(0.08, 0.1, 0.03, M.iron({ color: '#2a2622' }), 0.004); cap.position.set(0, 0, z + (z > 0 ? -0.05 : 0.05)); bar.add(cap); }
    for (const z of [-0.95, 0.95]) { for (const s of [-1, 1]) { const b = F.rbox(0.09, 0.02, 0.06, M.iron({ color: '#2a2622' }), 0.003); b.position.set(X + 0.1, BY + s * 0.06, z); G.add(b); } const stem = F.rbox(0.03, 0.14, 0.06, M.iron({ color: '#2a2622' }), 0.003); stem.position.set(X + 0.07, BY, z); G.add(stem); }
    // the lever lock on the bar: a brass case, a keyhole; the cutaway beside it once the hatpin is in
    const lock = new THREE.Group(); lock.position.set(0.03, 0, -1.0); lock.rotation.y = Math.PI / 2; bar.add(lock);
    const brassM = M.brass(), brassP = M.brass({ polished: true });
    const plate = F.rbox(0.13, 0.15, 0.03, brassM, 0.006); plate.position.set(0, 0, 0.015); plate.castShadow = true; lock.add(plate);
    const inner = F.rbox(0.1, 0.12, 0.004, brassP, 0.003); inner.position.set(0, 0, 0.032); lock.add(inner);
    const esc = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 20), brassP); esc.rotation.x = Math.PI / 2; esc.position.set(0, -0.025, 0.035); lock.add(esc);
    const keyway = F.rbox(0.006, 0.02, 0.006, M.matte('#060402'), 0.001); keyway.position.set(0, -0.03, 0.038); lock.add(keyway);
    const keyRound = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 12), M.matte('#060402')); keyRound.rotation.x = Math.PI / 2; keyRound.position.set(0, -0.019, 0.038); lock.add(keyRound);
    for (const [x, y] of [[-0.05, 0.06], [0.05, 0.06], [-0.05, -0.06], [0.05, -0.06]]) { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.003, 10), brassP); sc.rotation.x = Math.PI / 2; sc.position.set(x, y, 0.032); lock.add(sc); }
    const maker = makeCanvasPlane(0.08, 0.02, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#4a3410'; g.font = `700 ${h * 0.6}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CHUBB & SON', w / 2, h / 2); }, { px: 256, transparent: true });
    maker.position.set(0, 0.04, 0.035); lock.add(maker);
    const pinIn = new THREE.Group(); pinIn.position.set(0, -0.022, 0.04); pinIn.rotation.x = -0.5; pinIn.rotation.z = 0.25; pinIn.visible = false; lock.add(pinIn);
    const pinShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0012, 0.14, 8), M.iron({ color: '#9a9ea4', roughness: 0.3 })); pinShaft.position.z = 0.07; pinShaft.rotation.x = Math.PI / 2; pinIn.add(pinShaft);
    const pinBead = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), M.matte('#0a0a0e', { roughness: 0.2 })); pinBead.position.z = 0.14; pinIn.add(pinBead);
    // the cutaway: a bronze cross-section, four levers on a common pivot, the bolt with its stump and knob
    const cut = new THREE.Group(); cut.position.set(0.24, 0.005, 0.03); cut.visible = false; lock.add(cut);
    const housing = F.rbox(0.32, 0.18, 0.03, new THREE.MeshStandardMaterial({ color: '#6a5232', roughness: 0.5, metalness: 0.4 }), 0.006); housing.position.set(0, 0, -0.012); cut.add(housing);
    const well = F.rbox(0.29, 0.15, 0.012, M.matte('#15110c'), 0.003); well.position.set(0, 0, -0.012); cut.add(well);
    const leverM = new THREE.MeshStandardMaterial({ color: '#d9b25a', emissive: '#5a3e10', emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.7 });
    const boltM = new THREE.MeshStandardMaterial({ color: '#c0c6cc', emissive: '#30363c', emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.8 });
    const tickM = new THREE.MeshBasicMaterial({ color: '#9fe0c0' });
    const levers = [];
    const saved = ctx.state.get('parlour.shutters.levers', [0, 0, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const x = -0.1 + i * 0.058;
      const lever = new THREE.Group(); lever.position.set(x, -0.06, 0.004); cut.add(lever);
      const plateL = F.rbox(0.038, 0.1, 0.004, leverM, 0.002); plateL.position.y = 0.05; lever.add(plateL);
      const gate = F.rbox(0.012, 0.022, 0.005, M.matte('#2a1c0c'), 0.001); gate.position.set(0, 0.035 + (i % 2) * 0.004, 0.0); lever.add(gate);
      const pivotPin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 10), boltM); pivotPin.rotation.x = Math.PI / 2; pivotPin.position.set(0, 0.092, 0.002); lever.add(pivotPin);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.018, 6, 4), M.iron({ color: '#8a8a8a' })); spring.position.set(0, 0.11, 0.0); lever.add(spring);
      for (let n = 0; n < 3; n++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0015, 0.002), tickM); t.position.set(x - 0.027, 0.04 + n * NOTCH, 0.006); cut.add(t); }
      if (i === 0) for (let n = 0; n < 3; n++) { // the notch heights, 1 at rest, engraved down the left of the well
        const num = makeCanvasPlane(0.015, 0.015, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#1c1206'; g.font = `700 ${Math.round(h * 0.95)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n + 1), w / 2, h / 2 + h * 0.06); }, { px: 64, transparent: true });
        num.position.set(x - 0.0385, 0.04 + n * NOTCH, 0.007); cut.add(num);
      }
      const l = { group: lever, h: saved[i] || 0 };
      lever.position.y = -0.06 + l.h * NOTCH;
      levers.push(l);
      const proxy = ctx.hotspots.proxyBox(0.05, 0.13, 0.04); proxy.position.set(x, 0.0, 0.01); cut.add(proxy);
      this._hs({
        id: `parlour.shutters.lever${i}`, object: proxy, label: `Lever ${i + 1}`, scope: 'focus:parlour.shutters', highlight: plateL,
        enabled: () => this._picking && !this.house.isOpen('shutters'),
        onClick: () => this._liftLever(i),
        useItem: { bonekey: () => this._forceShutters(), '*': () => ctx.dialogue.caption('caption.nope') },
      });
    }
    const bolt = new THREE.Group(); bolt.position.set(0, -0.07, 0.004); cut.add(bolt);
    const boltBar = F.rbox(0.26, 0.016, 0.01, boltM, 0.002); boltBar.position.set(-0.01, 0, 0); bolt.add(boltBar);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 10), boltM); stump.rotation.x = Math.PI / 2; stump.position.set(-0.1, 0.016, 0.004); bolt.add(stump);
    const knobStem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 10), brassP); knobStem.rotation.z = Math.PI / 2; knobStem.position.set(0.13, 0, 0.0); bolt.add(knobStem);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 12), brassP); knob.position.set(0.148, 0, 0.0); bolt.add(knob);
    const kproxy = ctx.hotspots.proxyBox(0.06, 0.06, 0.05); kproxy.position.set(0.145, 0, 0.01); bolt.add(kproxy);
    this._hs({
      id: 'parlour.shutters.bolt', object: kproxy, label: 'Bolt knob', scope: 'focus:parlour.shutters', highlight: knob,
      enabled: () => this._picking && !this.house.isOpen('shutters'),
      onClick: () => this._tryBolt(),
      useItem: { bonekey: () => this._forceShutters(), '*': () => ctx.dialogue.caption('caption.nope') },
    });
    const cutLight = new THREE.PointLight('#ffe0b0', 0.0, 0.7, 2); cutLight.position.set(0.14, 0.06, 0.32); lock.add(cutLight);
    this.shutters = { leaves, bar, lock, cut, levers, bolt, pinIn, cutLight, plate };
    this._picking = false;

    const onOpen = async () => {
      if (this._picking) { ctx.audio.play('unlock', { gain: 0.6, pitch: 1.1 }); await ctx.tween.to(bolt.position, { x: 0.05 }, { duration: 0.3, ease: 'outQuad' }); }
      else ctx.audio.play('unlock', { gain: 0.6, pitch: 0.9 });
      this._picking = false; cut.visible = false; pinIn.visible = false; cutLight.intensity = 0;
      // pull back to a three-quarter view of the bay so the bar and its lock stay in frame as they come down and the leaves
      // swing past where the close-up camera stood
      // the bar starts down while the camera pulls back; the line (said by House when this resolves) lands as the moonlight
      // comes in, not after the leaves have finished swinging
      const back = inShutters() ? ctx.camera.refocus({ position: [X + 2.25, 1.35, 1.2], lookAt: [X + 0.15, 0.8, 0.0], fov: 52, duration: 0.6 }) : null;
      ctx.audio.play('stoneGrind', { gain: 0.35, pitch: 1.1 });
      await ctx.tween.to(bar.rotation, { x: -0.52 }, { duration: 0.6, ease: 'inQuad' });
      ctx.audio.play('drop', { gain: 0.6, pitch: 0.7 }); ctx.camera.shake(0.006, 0.25);
      if (back) await back;
      ctx.audio.play('doorOpen', { gain: 0.6, pitch: 0.9 });
      ctx.tween.to(this.moonLight, { intensity: 11 }, { duration: 2.2, ease: 'outSine' });
      ctx.tween.to(this.shaft.material.uniforms.uOpacity, { value: 0.13 }, { duration: 2.4, ease: 'outSine' });
      ctx.tween.to(bayGlow, { intensity: 2.2 }, { duration: 2.0 });
      ctx.tween.to(leaves[0].rotation, { y: 2.75 }, { duration: 1.7, ease: 'outCubic' });
      ctx.tween.to(leaves[1].rotation, { y: -2.75 }, { duration: 1.9, ease: 'outCubic' });
      await ctx.tween.delay(0.45); // the first of the moon is in: now the line
    };
    this.bayGlow = bayGlow;
    const after = (verb) => this._afterShutters(verb);
    const inShutters = () => ctx.camera.inFocus && ctx.camera.scope === 'focus:parlour.shutters';
    const force = async () => {
      if (this.house.isOpen('shutters')) return;
      if (!inShutters()) await focus();
      if (!inShutters()) return; // "Not tonight." left the close-up
      this.house.open('shutters', 'force', { onOpen, after });
    };
    this._forceShutters = force;
    const lockW = () => lock.localToWorld(new THREE.Vector3(0.1, 0.0, 0.03));
    const focus = async () => {
      const l = lockW();
      this._closeUp(true);
      await ctx.camera.focus({ position: [l.x + 0.7, l.y + 0.05, l.z - 0.07], lookAt: [l.x, l.y, l.z - 0.07], scope: 'focus:parlour.shutters', fov: 36, onExit: () => { this.house.blurLock(); this._endPicking(); this._closeUp(false); } });
      cutLight.intensity = 0.18;
      return this.house.focusLock('shutters', { onOpen, after });
    };
    const startPicking = async () => {
      if (this.house.isOpen('shutters')) return;
      if (!this.house.has('hatpin')) { ctx.audio.play('error', { gain: 0.4 }); return ctx.dialogue.say('react.shutters.nopin'); }
      if (!inShutters()) await focus();
      if (!inShutters() || this._picking) return;
      this._picking = true;
      ctx.audio.play('keyTurn', { gain: 0.45, pitch: 1.5 });
      pinIn.visible = true;
      cut.visible = true; cut.scale.set(0.01, 0.01, 0.01);
      await ctx.tween.to(cut.scale, { x: 1, y: 1, z: 1 }, { duration: 0.35, ease: 'outBack' });
    };
    this._startPicking = startPicking;
    const leafProxy = this._proxy(0.115, 2.4, BAY.z0 * 2, [X + 0.0575, 1.25, 0]); // front face just proud of the slats, behind the bar's proxy
    this._hs({
      id: 'parlour.shutters', object: leafProxy, label: () => (this.house.isOpen('shutters') ? 'The bay window' : 'Shutters, barred'),
      enabled: () => !this.house.isOpen('shutters'),
      onClick: () => focus(),
      useItem: { bonekey: force, hatpin: startPicking, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    // the whole bar and its lock plate: from the room it is the obvious thing across the window. Its front face stops just
    // proud of the plate, so the cutaway's levers and knob (further forward) still win in the close-up.
    const lockProxy = ctx.hotspots.proxyBox(0.125, 0.2, 2.2); lockProxy.position.set(0.0175, 0, -1.0); bar.add(lockProxy);
    this._hs({
      id: 'parlour.shutters.lock', object: lockProxy, label: 'Lever lock', scope: ['focus:parlour.shutters', 'room'], highlight: plate,
      enabled: () => !this.house.isOpen('shutters'),
      onClick: () => (inShutters() ? startPicking() : focus()),
      useItem: { hatpin: startPicking, bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    // the keyhole, where the hatpin goes: the whole escutcheon and a margin round it, ahead of the bar's proxy, so a
    // pin held over the lock finds it without a pixel hunt (it is the lock's own target in the close-up)
    const keyProxy = ctx.hotspots.proxyBox(0.11, 0.13, 0.03); keyProxy.position.set(0, -0.012, 0.072); lock.add(keyProxy);
    this._hs({
      id: 'parlour.shutters.keyhole', object: keyProxy, label: 'Keyhole', scope: ['focus:parlour.shutters', 'room'], highlight: esc,
      enabled: () => !this.house.isOpen('shutters') && !this._picking,
      onClick: () => (inShutters() ? startPicking() : focus()),
      useItem: { hatpin: startPicking, bonekey: force, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    // the open bay, for a look at the moon
    const bayProxy = this._proxy(0.6, 2.2, 2.0, [X - 0.6, 1.3, 0]);
    this._hs({ id: 'parlour.bay', object: bayProxy, label: 'The bay window', highlight: false, enabled: () => this.house.isOpen('shutters'), onClick: () => ctx.dialogue.caption('caption.bay') });
    ctx.dialogue.addScript({ 'caption.bay': 'The garden side of the house, by moonlight. Nothing has been pruned since 1958 and all of it is listening.' });
  }

  _liftLever(i) {
    const { ctx } = this;
    const l = this.shutters.levers[i];
    l.h = (l.h + 1) % 3;
    const seq = l.seq = (l.seq || 0) + 1;
    const rest = -0.06 + l.h * NOTCH;
    if (l.h !== 0) {
      ctx.audio.play('ratchet', { gain: 0.45, pitch: 1.5 + l.h * 0.15 });
      ctx.tween.to(l.group.position, { y: rest }, { duration: 0.18, ease: 'outBack' });
    } else {
      // past the third notch it lets go: a lift a hair above three, then the fall to the bottom with a clack and a bounce
      ctx.audio.play('ratchet', { gain: 0.35, pitch: 2.0 });
      ctx.tween.to(l.group.position, { y: -0.06 + 2.6 * NOTCH }, { duration: 0.08, ease: 'outQuad' }).then(() => {
        if (l.seq !== seq) return; // clicked again meanwhile: the newer move owns the lever
        ctx.audio.play('drop', { gain: 0.7, pitch: 1.3 });
        ctx.camera.shake(0.002, 0.12);
        return ctx.tween.to(l.group.position, { y: rest }, { duration: 0.32, ease: 'outBounce' });
      });
      if (!ctx.state.get('parlour.shutters.wrapTaught')) {
        ctx.state.set('parlour.shutters.wrapTaught', true);
        ctx.dialogue.caption('caption.shutters.wrap', { duration: 4.5, scope: 'focus:parlour.shutters' });
      }
    }
    ctx.state.set('parlour.shutters.levers', this.shutters.levers.map((x) => x.h));
  }
  _tryBolt() {
    const { ctx } = this;
    const { levers, bolt } = this.shutters;
    if (levers.every((l, i) => l.h === LEVER_SOLUTION[i])) {
      const { onOpen, after } = this.house._focus || {};
      this.house.open('shutters', 'pick', { onOpen, after });
      return;
    }
    // the bolt passes the levers left to right and stops at the first one out of place: how far it goes is the reading
    const right = levers.findIndex((l, i) => l.h !== LEVER_SOLUTION[i]);
    ctx.audio.play('click', { gain: 0.5, pitch: 0.7 + right * 0.1 });
    ctx.camera.shake(0.003, 0.15);
    const travel = 0.006 + right * 0.012;
    ctx.tween.to(bolt.position, { x: travel }, { duration: 0.1 + right * 0.06, ease: 'outQuad' }).then(() => ctx.tween.delay(0.35)).then(() => ctx.tween.to(bolt.position, { x: 0 }, { duration: 0.15, ease: 'inQuad' }));
    ctx.dialogue.caption(`react.shutters.tick.${right}`, { duration: 3, scope: 'focus:parlour.shutters' });
  }
  _endPicking() {
    const s = this.shutters;
    if (s) s.cutLight.intensity = 0;
    if (!this._picking) return;
    this._picking = false;
    s.cut.visible = false; s.pinIn.visible = false;
  }

  /** After the shutters open, by any verb: moonlight on her, and the page. */
  async _afterShutters(verb) {
    const { ctx } = this;
    if (this._asked) return;
    this._asked = true;
    ctx.hotspots.lock();
    try {
      ctx.camera.lookAtPoint(this.pell.position.clone().setY(1.2));
      this.pell.userData.lookAt(ctx.camera.camera.position.clone(), 12);
      await ctx.tween.delay(0.7);
      if (!this.house.pageOffered()) { if (this.tallow.visible) await ctx.dialogue.say('react.tallow.pell'); return; }
      const idx = await ctx.dialogue.choice('choice.pell.page');
      if (idx === 0) {
        ctx.audio.play('page', { gain: 0.6 });
        this.house.takePage();
        await ctx.dialogue.say('react.pell.taken');
        await ctx.dialogue.say('react.page');
      } else {
        await ctx.dialogue.say('react.pell.left');
      }
      if (this.tallow.visible) { this.tallow.userData.lookAt(this.pell.position.clone().setY(1.3), 5); await ctx.dialogue.say('react.tallow.pell'); }
    } finally { ctx.hotspots.unlock(); }
    void verb;
  }

  // ───────────────────────────────────────────────── Miss Pell
  _buildPell() {
    const G = this.group, { ctx } = this;
    const standing = makeFigure({ kind: 'pell', pose: 'standing' }); standing.position.set(...PELL.pos); standing.rotation.y = PELL.yaw; G.add(standing);
    const seated = makeFigure({ kind: 'pell', pose: 'seated' }); seated.position.set(...PELL_SEAT.pos); seated.rotation.y = PELL_SEAT.yaw; seated.visible = false; G.add(seated);
    this.pell = standing; this.pellSeated = seated;
    const replies = {
      lantern: () => this._lanternChoice(),
      hatpin: () => ctx.dialogue.say([{ who: 'pell', text: 'Mine, that was. Keep it; I have nothing left that wants pinning.' }]),
      bonekey: () => ctx.dialogue.say([{ who: 'pell', text: 'Put it away, do. I know what they cost; I counted mine.' }]),
      page: () => ctx.dialogue.say([{ who: 'pell', text: 'Yours now. Please do not read it to me.' }]),
      '*': () => ctx.dialogue.caption('caption.nope'),
    };
    this._hs({ id: 'parlour.pell', object: standing, label: 'Miss Pell', enabled: () => standing.visible, onClick: () => ctx.hints.ask(), useItem: replies });
    this._hs({ id: 'parlour.pell.seated', object: seated, label: 'Miss Pell', enabled: () => seated.visible, onClick: () => ctx.hints.ask(), useItem: replies });
  }
  async _lanternChoice() {
    const { ctx } = this;
    if (this.house.lantern !== 'carried') return;
    this.pell.userData.lookAt(ctx.camera.camera.position.clone(), 8);
    // the replies play here, not inside the choice, so the lantern leaves your hands before she thanks you for it
    const def = ctx.script?.['choice.pell.lantern'];
    if (!def) return;
    const idx = await ctx.dialogue.choice({ ...def, options: def.options.map((o) => ({ ...o, reply: [] })) });
    if (idx !== 0) { if (idx === 1) await ctx.dialogue.say(def.options[1].reply); return; }
    if (!this.house.giveLantern('pell')) return;
    ctx.audio.play('drop', { gain: 0.5 });
    this.tableLantern.visible = true;
    this._carried.set(false);
    this._syncDome(true);
    ctx.state.set('hint.shutters.level', 3); // she has said it outright
    await ctx.dialogue.say('react.pell.lantern.given');
    await ctx.dialogue.say(def.options[0].reply);
  }
  /** She stands when you enter: a beat seated, then on her feet. */
  async _rise() {
    const { ctx } = this;
    this.pell.visible = false; this.pellSeated.visible = true;
    await ctx.tween.delay(1.1);
    if (ctx.game.currentRoom !== this) return;
    ctx.audio.play('paperRustle', { gain: 0.3, pitch: 0.7 });
    this.pellSeated.visible = false; this.pell.visible = true;
    this.pell.position.set(PELL_SEAT.pos[0] - 0.1, 0, PELL_SEAT.pos[2] - 0.25); this.pell.rotation.y = 0;
    this.pell.scale.set(1, 0.96, 1);
    ctx.tween.to(this.pell.scale, { y: 1 }, { duration: 0.35, ease: 'outBack' });
    await this.pell.userData.walkTo(ctx, PELL.pos, { faceYaw: PELL.yaw, speed: 0.7 });
    this.pell.userData.lookAt(ctx.camera.camera.position.clone(), 8);
  }
  onHintAsked() { this.pell.userData.lookAt(this.ctx.camera.camera.position.clone(), 5); }
  /** Hints key off the house, not the order or the verb: a lock open by any means (or any save) is never hinted again. */
  prereqMet(id) { return !this.house.isOpen(id); }

  // ───────────────────────────────────────────────── Mrs. Tallow, if she is sent for
  _buildTallow() {
    const { ctx } = this;
    const fig = makeFigure({ kind: 'tallow' });
    fig.position.set(...TALLOW_DOOR.pos); fig.rotation.y = TALLOW_DOOR.yaw; fig.visible = false; this.group.add(fig);
    this.tallow = fig;
    this._hs({
      id: 'parlour.tallow', object: fig, label: 'Mrs. Tallow', enabled: () => fig.visible,
      onClick: () => { fig.userData.lookAt(ctx.camera.camera.position.clone(), 4); ctx.dialogue.say(this.pell.visible || this.pellSeated.visible ? 'react.tallow.parlour' : 'react.tallow.parlour.after'); },
      useItem: { lantern: () => { ctx.dialogue.say([{ who: 'tallow', text: 'It was left for you, not for me. Keep it.' }]); return false; }, '*': () => ctx.dialogue.caption('caption.nope') },
    });
  }
  tallowHere() { return this.tallow.visible; }
  async tallowTo(lockId) {
    const s = TALLOW_SPOTS[lockId]; if (!s) return;
    if (!this.tallow.visible) { this.tallow.position.set(...TALLOW_DOOR.pos); this.tallow.rotation.y = TALLOW_DOOR.yaw; this.tallow.visible = true; }
    this.ctx.state.set('parlour.tallow.here', true);
    await this._tallowWalk(s.pos, s.yaw, 1.35);
    this.ctx.state.set('parlour.tallow.spot', lockId);
  }
  /** Her walk, round the table rather than through it when she starts on the bay side of it. */
  async _tallowWalk(pos, yaw, speed) {
    const t = this.tallow;
    if ((t.position.x < -1.2) !== (pos[0] < -1.2)) await t.userData.walkTo(this.ctx, [-1.3, 0, 1.6], { speed });
    await t.userData.walkTo(this.ctx, pos, { faceYaw: yaw, speed });
  }
  /**
   * The house has called: she comes in and stands where you can see her; if the shutters were opened, Miss Pell goes down
   * now, out of the door while you watch, so the call line comes with Tallow in the room and Pell already gone.
   */
  async onCall() {
    const { ctx } = this;
    if (!this.tallow.visible) { this.tallow.position.set(...TALLOW_DOOR.pos); this.tallow.rotation.y = TALLOW_DOOR.yaw; this.tallow.visible = true; }
    ctx.camera.lookAtPoint(new THREE.Vector3(TALLOW_SIDE.pos[0], 1.2, TALLOW_SIDE.pos[2]));
    await this._tallowWalk(TALLOW_SIDE.pos, TALLOW_SIDE.yaw, 1.3);
    if (this.house.pellDown && (this.pell.visible || this.pellSeated.visible)) await this._pellOut();
    ctx.camera.lookAtPoint(new THREE.Vector3(TALLOW_SIDE.pos[0], 1.3, TALLOW_SIDE.pos[2]));
    this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 6);
    await ctx.tween.delay(0.4);
  }
  /** Miss Pell's line, then her walk across the room and out by the door, the camera following her to it. */
  async _pellOut() {
    const { ctx } = this;
    const pell = this.pell;
    if (this.pellSeated.visible) { this.pellSeated.visible = false; pell.position.set(...PELL.pos); pell.rotation.y = PELL.yaw; pell.visible = true; }
    ctx.camera.lookAtPoint(pell.position.clone().setY(1.2));
    pell.userData.lookAt(this.tallow.position.clone().setY(1.5), 6);
    await ctx.dialogue.say('react.pell.down');
    for (let i = 0; i < PELL_OUT.length; i++) {
      const to = PELL_OUT[i];
      // the camera goes with her: the table, then the front of the room, then the door she leaves by
      ctx.camera.lookAtPoint(i < PELL_OUT.length - 1 ? new THREE.Vector3(to[0], 1.2, to[2]) : new THREE.Vector3(W / 2 + 0.3, 1.3, DOOR.z));
      await pell.userData.walkTo(ctx, to, { speed: 1.05 });
    }
    pell.visible = false;
    await ctx.tween.delay(0.35);
  }
  /** After her line: if Miss Pell is somehow still here and going down, she goes now; otherwise she keeps the parlour. */
  async afterCall() {
    const { ctx } = this;
    if (this.house.pellDown && (this.pell.visible || this.pellSeated.visible)) await this._pellOut();
    else if (this.pell.visible) await ctx.dialogue.say('react.pell.stays');
  }

  // ───────────────────────────────────────────────── dressing
  _buildDressing() {
    const S = this.statics, G = this.group;
    const rug = F.rug({ w: 2.6, d: 2.6, base: '#5a2a2e', accent: '#c9a97a', dark: '#2a1418' }); rug.position.set(this.table.x, 0, this.table.z); S.add(rug);
    const chair = F.armchair({ color: '#7a3a44', w: 0.84 }); chair.position.set(-2.55, 0, -1.85); chair.rotation.y = 0.9; S.add(chair);
    const cushion = F.cushion({ w: 0.34, h: 0.34, d: 0.1, color: '#c9a97a' }); cushion.position.set(-2.55, 0.62, -1.85); cushion.rotation.y = 0.9; cushion.rotation.x = -0.35; S.add(cushion);
    const sideT = F.lathe([[0.16, 0], [0.16, 0.02], [0.04, 0.05], [0.03, 0.55], [0.07, 0.6], [0.24, 0.6], [0.25, 0.63], [0, 0.63]], M.walnut({ tint: '#3a2418' }), 18); sideT.position.set(-2.95, 0, -1.1); S.add(sideT);
    const doily = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), M.matte('#e8e0cc')); doily.rotation.x = -Math.PI / 2; doily.position.set(-2.95, 0.632, -1.1); S.add(doily);
    const bookM = M.matte('#4a2a1a'); const book = F.rbox(0.14, 0.03, 0.2, bookM, 0.003); book.position.set(-2.95, 0.65, -1.1); book.rotation.y = 0.3; S.add(book);
    // a second picture on the east wall, a plant stand by the door
    const pic = F.pictureFrame({ w: 0.5, h: 0.62, border: 0.05, style: 'gilt', px: 512, draw: (g, w, h) => drawPortrait(g, w, h) });
    pic.position.set(W / 2 - 0.04, 1.95, -0.6); pic.rotation.y = -Math.PI / 2; G.add(pic);
    const fern = new THREE.Group(); fern.position.set(2.9, 0, -2.2); S.add(fern);
    const fstand = F.lathe([[0.16, 0], [0.16, 0.02], [0.03, 0.04], [0.03, 0.9], [0.14, 0.92], [0, 0.92]], M.walnut({ tint: '#2a1a12' }), 14); fern.add(fstand);
    const pot = F.lathe([[0.1, 0.92], [0.12, 1.02], [0.13, 1.1], [0.1, 1.1], [0, 1.08]], new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.9 }), 14); fern.add(pot);
    const leafM = new THREE.MeshStandardMaterial({ color: '#3a4a2a', roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.4), leafM); l.position.set(0, 1.2, 0); l.rotation.y = i * 0.7; l.rotation.x = 0.9 - (i % 3) * 0.2; l.translateY(0.15); fern.add(l); }
    G.add(P.dustMotes({ box: [6, 2.8, 5], center: [0, 1.6, 0], count: 160, color: '#d8c8b0', size: 0.013, opacity: 0.3 }));
  }

  // ───────────────────────────────────────────────── restore / lifecycle
  _restore() {
    const h = this.house, s = this.ctx.state;
    if (h.isOpen('caddy')) {
      this.caddy.lidPivot.rotation.x = -1.95; this.caddy.inLight.intensity = 0.3;
      if (h.verb('caddy') !== 'force') { this.caddy.hands.h = CADDY_SOLUTION[0]; this.caddy.hands.m = CADDY_SOLUTION[1]; this.caddy.setHands(); }
    }
    if (h.s.items.hatpin !== 'away') this.caddy.pin.visible = false;
    this.tableLantern.visible = h.lanternWith === 'pell';
    if (h.isOpen('shutters')) {
      this.shutters.leaves[0].rotation.y = 2.75; this.shutters.leaves[1].rotation.y = -2.75; this.shutters.bar.rotation.x = -0.52;
      this.moonLight.intensity = 11; this.shaft.userData.setOpacity(0.13); this.bayGlow.intensity = 2.2;
      this._asked = true;
    }
    if (h.residents().pell.place === 'cellar') this.pell.visible = false;
    if (h.called) { this.tallow.visible = true; this.tallow.position.set(...TALLOW_SIDE.pos); this.tallow.rotation.y = TALLOW_SIDE.yaw; }
    else if (s.get('parlour.tallow.here')) {
      const spot = TALLOW_SPOTS[s.get('parlour.tallow.spot')] || TALLOW_SPOTS.caddy;
      this.tallow.visible = true; this.tallow.position.set(...spot.pos); this.tallow.rotation.y = spot.yaw;
    }
    this._syncDome(false);
  }

  enter() {
    const { ctx } = this;
    this._carried.set(this.house.lantern === 'carried');
    this._syncDome(false);
    ctx.audio.setClockRunning?.(this.house.s.clock > 0);
    if (!ctx.state.get('parlour.intro.seen')) {
      if (this.pell.visible) this._rise();
      const intro = async () => {
        if (ctx.game.currentRoom !== this || ctx.state.get('parlour.intro.seen') || this.house.residents().pell.place !== 'parlour') return;
        // not over a close-up, a line, or a caption still on screen, nor while she is still getting up: wait for quiet
        const captionUp = ctx.dialogue.captionEl && !ctx.dialogue.captionEl.classList.contains('oc-hidden');
        if (!this.pell.visible || ctx.camera.inFocus || ctx.dialogue.isOpen || ctx.dialogue.busy || captionUp || ctx.hotspots.locked || ctx.papers?.isOpen) { this._timers.push(setTimeout(intro, 2500)); return; }
        ctx.state.set('parlour.intro.seen', true);
        this.pell.userData.lookAt(ctx.camera.camera.position.clone(), 10);
        await ctx.dialogue.say('parlour.intro');
      };
      this._timers.push(setTimeout(intro, 8000));
    } else if (this.pell.visible) {
      this.pell.userData.lookAt(ctx.camera.camera.position.clone(), 5);
    }
  }
  enterTitle() { this._carried.set(false); }
  exit() { for (const t of this._timers) clearTimeout(t); this._timers = []; this._carried.set(false); this._endPicking(); }

  update(dt, t) { this._carried.update(dt, t); }
}

// ───────────────────────────────────────────────── canvas drawings
/** The hall lamp's light through the open door, thrown along the south wall: a fan that widens away from the door (the
 * plane faces −Z, so canvas left is world +X, the door end). */
function hallFanTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(255,170,90,0.0)'); grad.addColorStop(0.12, 'rgba(255,170,90,0.34)'); grad.addColorStop(0.75, 'rgba(255,160,80,0.22)'); grad.addColorStop(1, 'rgba(255,150,70,0.0)');
  g.fillStyle = grad;
  g.filter = 'blur(10px)';
  g.beginPath(); g.moveTo(20, 110); g.lineTo(500, 20); g.lineTo(500, 240); g.lineTo(20, 170); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function drawCaddyFace(g, w, h) {
  g.clearRect(0, 0, w, h);
  const R = w / 2;
  const gr = g.createRadialGradient(R * 0.8, R * 0.8, R * 0.1, R, R, R);
  gr.addColorStop(0, '#f0e2c0'); gr.addColorStop(1, '#c9a860');
  g.fillStyle = gr; g.beginPath(); g.arc(R, R, R * 0.98, 0, TAU); g.fill();
  g.strokeStyle = '#4a3410'; g.lineWidth = 6; g.beginPath(); g.arc(R, R, R * 0.93, 0, TAU); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2, r0 = R * (i % 5 ? 0.86 : 0.8), r1 = R * 0.92;
    g.lineWidth = i % 5 ? 2 : 5; g.beginPath(); g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); g.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1); g.stroke();
  }
  const nums = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
  g.fillStyle = '#2a1c08'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(w * 0.11)}px ${SERIF}`;
  nums.forEach((n, i) => { const a = (i / 12) * TAU - Math.PI / 2; g.fillText(n, R + Math.cos(a) * R * 0.66, R + Math.sin(a) * R * 0.66); });
  g.beginPath(); g.arc(R, R, R * 0.05, 0, TAU); g.fill();
}

function drawMantelFace(g, w, h) {
  g.clearRect(0, 0, w, h);
  const R = w / 2;
  const gr = g.createRadialGradient(R, R * 0.9, 10, R, R, R);
  gr.addColorStop(0, '#f3e9cf'); gr.addColorStop(0.85, '#e2d2a8'); gr.addColorStop(1, '#b89a66');
  g.fillStyle = gr; g.beginPath(); g.arc(R, R, R * 0.98, 0, TAU); g.fill();
  const r = rng(9);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(90,60,20,${r() * 0.07})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
  g.strokeStyle = '#3a2614'; g.lineWidth = 4; g.beginPath(); g.arc(R, R, R * 0.9, 0, TAU); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2, r0 = R * (i % 5 ? 0.84 : 0.78), r1 = R * 0.9;
    g.lineWidth = i % 5 ? 2 : 4; g.beginPath(); g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); g.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1); g.stroke();
  }
  const nums = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#1e140c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(w * 0.085)}px ${SERIF}`;
  nums.forEach((n, i) => { const a = (i / 12) * TAU - Math.PI / 2; g.fillText(n, R + Math.cos(a) * R * 0.63, R + Math.sin(a) * R * 0.63); });
  g.font = `italic 600 ${Math.round(w * 0.045)}px ${SERIF}`; g.fillStyle = '#4a321c'; g.fillText('Vesper & Daughters', R, R * 1.3);
  // the hands: a quarter past four, and have been
  const hand = (len, wd, ang) => {
    g.save(); g.translate(R, R); g.rotate(ang);
    g.fillStyle = '#14100c'; g.beginPath(); g.moveTo(-wd, 0.12 * R); g.lineTo(-wd * 0.5, -len * 0.6); g.lineTo(0, -len); g.lineTo(wd * 0.5, -len * 0.6); g.lineTo(wd, 0.12 * R); g.closePath(); g.fill();
    g.restore();
  };
  hand(R * 0.46, R * 0.05, (4.25 / 12) * TAU);
  hand(R * 0.72, R * 0.035, (15 / 60) * TAU);
  g.fillStyle = '#14100c'; g.beginPath(); g.arc(R, R, R * 0.05, 0, TAU); g.fill();
}

function drawBadge203(g, w, h) {
  g.clearRect(0, 0, w, h);
  const gr = g.createRadialGradient(w * 0.4, h * 0.35, w * 0.05, w / 2, h / 2, w / 2);
  gr.addColorStop(0, '#e2c270'); gr.addColorStop(1, '#8a6a2a');
  g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); g.fill();
  g.strokeStyle = '#5a4418'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 8, 0, TAU); g.stroke();
  g.fillStyle = '#3a2a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.12)}px ${SERIF}`;
  g.fillText('NIGHT', w / 2, h * 0.28);
  // LOCKSMITH filed off: a ghost of the word, scratched; STAFF struck in over it, not quite straight
  g.save(); g.globalAlpha = 0.28; g.fillText('LOCKSMITH', w / 2, h * 0.43); g.restore();
  g.save(); g.strokeStyle = 'rgba(60,40,10,0.35)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const y = h * 0.37 + i * 2.2; g.beginPath(); g.moveTo(w * 0.22, y); g.lineTo(w * 0.78, y + 1); g.stroke(); } g.restore();
  g.save(); g.translate(w / 2, h * 0.45); g.rotate(-0.06); g.font = `900 ${Math.round(h * 0.13)}px Inter, sans-serif`; g.fillStyle = '#2a1a08'; g.fillText('STAFF', 2, 0); g.restore();
  g.font = `700 ${Math.round(h * 0.17)}px ${SERIF}`; g.fillStyle = '#3a2a10'; g.fillText('No. 203', w / 2, h * 0.7);
}

function drawCard(g, w, h, rank, suit) {
  g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b8ad96'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
  const red = suit === '♥' || suit === '♦';
  g.fillStyle = red ? '#9a2222' : '#1a1a22';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.17)}px ${SERIF}`;
  g.fillText(rank, w * 0.16, h * 0.12); g.font = `${Math.round(h * 0.13)}px serif`; g.fillText(suit, w * 0.16, h * 0.25);
  g.save(); g.translate(w, h); g.rotate(Math.PI); g.font = `700 ${Math.round(h * 0.17)}px ${SERIF}`; g.fillText(rank, w * 0.16, h * 0.12); g.font = `${Math.round(h * 0.13)}px serif`; g.fillText(suit, w * 0.16, h * 0.25); g.restore();
  g.font = `${Math.round(h * 0.26)}px serif`;
  if (rank === 'A') g.fillText(suit, w / 2, h / 2);
  else if (rank === '2') { g.fillText(suit, w / 2, h * 0.3); g.save(); g.translate(w / 2, h * 0.7); g.rotate(Math.PI); g.fillText(suit, 0, 0); g.restore(); }
  else { g.fillText(suit, w / 2, h * 0.28); g.fillText(suit, w / 2, h * 0.5); g.save(); g.translate(w / 2, h * 0.72); g.rotate(Math.PI); g.fillText(suit, 0, 0); g.restore(); }
  const r = rng(rank.charCodeAt(0) + suit.charCodeAt(0));
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,90,40,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 3, 3); }
}

function drawSampler(g, w, h) {
  g.fillStyle = '#e6dcc2'; g.fillRect(0, 0, w, h);
  const r = rng(31);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(120,100,60,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; g.setLineDash([4, 4]); g.strokeRect(w * 0.06, h * 0.08, w * 0.88, h * 0.84); g.setLineDash([]);
  g.fillStyle = '#7a5a2a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.13)}px monospace`;
  g.fillText('ASK AND IT', w / 2, h * 0.3); g.fillText('SHALL BE GIVEN', w / 2, h * 0.47);
  g.font = `${Math.round(h * 0.075)}px monospace`; g.fillStyle = '#6a4a2a';
  g.fillText('D. PELL · HER WORK · 1958', w / 2, h * 0.68);
  g.fillStyle = '#5a7a3a';
  for (let i = 0; i < 12; i++) { const x = w * (0.12 + i * 0.07); g.fillRect(x, h * 0.82, 6, 6); g.fillRect(x + 3, h * 0.85, 6, 6); }
}

function drawPortrait(g, w, h) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a2420'); gr.addColorStop(1, '#141010');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3a3028'; g.beginPath(); g.ellipse(w / 2, h * 0.75, w * 0.3, h * 0.3, 0, 0, TAU); g.fill();
  g.fillStyle = '#c9b098'; g.beginPath(); g.ellipse(w / 2, h * 0.4, w * 0.14, h * 0.17, 0, 0, TAU); g.fill();
  g.fillStyle = '#2a2018'; g.beginPath(); g.ellipse(w / 2, h * 0.3, w * 0.16, h * 0.1, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(120,80,30,0.3)'; g.fillRect(0, 0, w, h);
}
