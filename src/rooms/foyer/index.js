// THE FOYER (`foyer`), and the landing at the top of its stair. See docs/SLICE.md and docs/GAME.md §3.
//
// Layout (metres, floor centre origin, north = −Z; the player stands near +Z just inside the front door):
//   south (+Z): the front door with its fanlight (moonlight, the house's name leaded in backwards), the coat stand,
//               the framed floor plan; the name again in moonlight on the tiles
//   north (−Z): the stair, rising west→east along the back wall to a landing in the north-east corner; the lantern
//               cupboard in the panelling under it
//   west  (−X): the parlour door (four letter rings), the hall clock, the green baize door in the north-west corner
//   east  (+X): the conservatory doors (moon-dial lock), the painting, the hall table (bell, ledger, lamp, honesty)
//   landing:    the nursery door at child height on the east wall (a knocker and four pegs), a sampler under glass
//               on the north wall, a rail over the hall. A camera walk inside this room, not a room of its own.
// Locks: cup, moons, parlour, landing. Every visual consequence is derived from ctx.house / ctx.state in build().
import * as THREE from 'three';
import { Room } from '../../engine/Room.js';
import * as M from '../../engine/props/materials.js';
import * as F from '../../engine/props/furniture.js';
import * as P from '../../engine/props/particles.js';
import * as L from '../../engine/props/lights.js';
import { makeCanvasPlane } from '../../engine/props/text.js';
import { makeCanvas, canvasTexture, rng } from '../../engine/props/textures.js';
import { makeFigure } from '../../engine/props/figure.js';
import { grandfatherClock, cobweb } from './clock.js';
import { drawMoon, mergeStatic, carriedLight, tileTexture, wallpaperTexture, lanternProp, stripDoorHardware, stairY } from '../shared.js';

const TAU = Math.PI * 2;
const W = 6, D = 7, H = 4.8;
const MOON_SOLUTION = [1, 2, 4, 6]; // waxing crescent, first quarter, full, last quarter
const STAIR = { x0: -2.7, rise: 0.2, run: 0.26, steps: 12, z0: -3.5, w: 1.1 };
const LAND = { x0: STAIR.x0 + STAIR.steps * STAIR.run, x1: W / 2, y: (STAIR.steps + 1) * STAIR.rise, z0: STAIR.z0, z1: STAIR.z0 + STAIR.w };
const LANDING_VANTAGE = { position: [1.25, LAND.y + 1.42, -2.95], lookAt: [W / 2, LAND.y + 0.82, -2.88], yawLimit: 180, pitchLimit: 62, fov: 60 };
const PARLOUR_OPEN_VIEW = { position: [-W / 2 + 2.3, 1.65, 1.15], lookAt: [-W / 2, 1.1, 0.9] }; // the parlour doorway, opening
const LANDING_OPEN_VIEW = { position: [1.3, LAND.y + 1.25, -2.75], lookAt: [W / 2, LAND.y + 0.7, -2.95] }; // the nursery door, opening
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ROOK = [17, 14, 14, 10];
const RING_START = [1, 18, 6, 13];
const RING_R = 0.05, RING_L = 0.05;          // the parlour lock's letter drums
const RING_GLYPH_ROT = Math.PI / 2;            // glyph up = canvas +u = up the drum's face at the reading line
const RING_PHASE = 0;                           // turns a drum so its value's cell faces the reading line
const ringAngle = (turn) => -TAU * (turn + 0.5) / 26 + RING_PHASE;
const BAIZE = { z: -2.75, w: 0.92, h: 2.08 };
const PARLOUR = { z: 0.9, w: 1.05, h: 2.2 };    // the parlour door's opening in the west wall
const CONS = { z: -1.0, dw: 0.72, dh: 2.25 };    // the conservatory doors' opening in the east wall (two leaves of dw)
const KNOCK = { quick: 1.2, pauseMax: 6, hush: 2 };
// Mrs. Tallow's stair-top spot on a landing ring (and at the call up there): four treads short of the landing, facing up.
// The landing views (vantage, nursery close-up, the door opening) all look east from x >= 1.25, so she stays behind
// them and never stands between the player and the nursery door; from the hall she reads at the top of the stair.
const TALLOW_STAIRTOP = { x: -0.55, z: STAIR.z0 + STAIR.w / 2, yaw: Math.PI / 2 };

export default class Foyer extends Room {
  static id = 'foyer';
  static title = 'The Foyer';
  static vantage = { position: [0.1, 1.6, 2.1], lookAt: [0.4, 0.95, -1.2], yawLimit: 180, pitchLimit: 40, fov: 62 };
  static puzzleOrder = ['cup', 'moons', 'parlour', 'landing'];

  async build() {
    const { ctx } = this;
    this.background = new THREE.Color('#06050a');
    this.fog = new THREE.FogExp2('#0a0810', 0.045);
    this.envIntensity = 0.3;
    this.exposure = 1.15;
    this.bloom = { strength: 0.38, threshold: 0.82, radius: 0.5 };
    this._timers = [];
    this._onLanding = false;
    this._calledPlaced = false;
    this._buildShell();
    this._buildLights();
    this._buildSouth();
    this._buildFloorName();
    this._buildStair();
    this._buildLanding();
    this._buildWest();
    this._buildBaize();
    this._buildEast();
    this._buildTable();
    this._buildDressing();
    this._buildTallow();
    this.group.updateMatrixWorld(true);
    this._restore();
    this._carried = carriedLight(ctx, this.group);
    // the call: she is beside you before she speaks, wherever you are
    this.house.on((s) => { if (s.called && !this._calledPlaced && ctx.game.currentRoom === this && !ctx.game._titleMode) { this._calledPlaced = true; this._placeTallowBeside(); } });
  }

  // ───────────────────────────────────────────────── helpers
  _hs(spec) { return this.ctx.hotspots.add(spec); }
  _proxy(w, h, d, pos, parent = this.group) { const p = this.ctx.hotspots.proxyBox(w, h, d); p.position.set(...pos); parent.add(p); return p; }
  get house() { return this.ctx.house; }
  get ropeDown() { return !!this.ctx.state.get('foyer.rope.down'); }
  /** Hall hotspots that make no sense from the landing. */
  _inHall() { return !this._onLanding; }
  /** A caption that waits for any line on screen (or queued) to finish, so a caption and a dialogue box never show
   *  together. `scope`: dropped if the player has left that close-up meanwhile. `unlessShowing`: skip it if another
   *  caption (e.g. the first close-up's verbs) is up by then. */
  async _captionAfterLines(key, { duration, scope, unlessShowing = false } = {}) {
    const { dialogue } = this.ctx;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(0);
    if (dialogue.busy) { while (dialogue.busy) await wait(80); await wait(120); }
    if (unlessShowing && !dialogue.captionEl.classList.contains('oc-hidden')) return;
    if (scope && this.ctx.camera.scope !== scope) return;
    dialogue.caption(key, { duration, scope });
  }
  _go(roomId) {
    const { ctx } = this;
    if (!ctx.game.registry.has(roomId)) { ctx.dialogue.caption(`The ${roomId} is dark. Nobody has built it yet.`); return; }
    ctx.game.goToRoom(roomId);
  }

  // ───────────────────────────────────────────────── shell + lights
  _buildShell() {
    const G = this.group;
    const wallTex = wallpaperTexture({ base: '#4a3a44', motif: '#5e4a56', seed: 3 });
    const wall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
    wall.map.repeat.set(3, 1.6 * H / 4.2);
    const floor = new THREE.MeshStandardMaterial({ map: tileTexture({ a: '#15110f', b: '#b7ab96' }), roughness: 0.35, metalness: 0.05 });
    floor.map.repeat.set(5, 6);
    // the west and east walls are built by hand so their doors are real openings (the baize door, the parlour door,
    // the conservatory doors); each opening is covered by its door's own frame
    const shell = F.roomShell({ w: W, d: D, h: H, floor, wall, ceiling: M.plaster({ tint: '#4a3d3a', repeat: [2, 2] }), beams: 0, wainscot: 1.05, omit: ['west', 'east'] });
    G.add(shell);
    this.wallBase = { base: '#4a3a44', motif: '#5e4a56', seed: 3 };
    const cutPanels = [];
    const cutWall = (side, openings) => {
      const sx = side === 'west' ? -1 : 1, x = sx * W / 2, ry = -sx * Math.PI / 2;
      // a panel spanning world z0..z1 and y0..y1, its UVs cut from the whole wall so the paper lines up with the shared material
      const panel = (z0, z1, y0, y1) => {
        if (z1 - z0 < 0.005 || y1 - y0 < 0.005) return;
        const geo = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
        const uv = geo.attributes.uv, pos = geo.attributes.position;
        for (let i = 0; i < uv.count; i++) {
          const zw = (z0 + z1) / 2 + (side === 'west' ? -pos.getX(i) : pos.getX(i)); // world z of this vertex (west: local +x runs to −z)
          const u = side === 'west' ? (D / 2 - zw) / D : (zw + D / 2) / D;
          uv.setXY(i, u, (pos.getY(i) + (y0 + y1) / 2) / H);
        }
        const m = new THREE.Mesh(geo, wall);
        m.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2); m.rotation.y = ry; m.receiveShadow = true; m.name = `wall_${side}`;
        shell.add(m); cutPanels.push(m);
      };
      const cuts = [...openings].sort((a, b) => a.z - b.z);
      let z = -D / 2;
      const runs = [];
      for (const o of cuts) {
        const a = o.z - o.w / 2, b = o.z + o.w / 2;
        panel(z, a, 0, H); runs.push([z, a]);
        panel(a, b, o.h, H); // the lintel
        z = b;
      }
      panel(z, D / 2, 0, H); runs.push([z, D / 2]);
      // baseboard, wainscot and rail on the solid runs
      for (const [z0, z1] of runs) {
        const len = z1 - z0, zc = (z0 + z1) / 2;
        if (len < 0.01) continue;
        const b = F.rbox(len, 0.14, 0.03, M.walnut(), 0.006); b.position.set(x - sx * 0.015, 0.07, zc); b.rotation.y = ry; shell.add(b);
        const p = F.rbox(len, 1.05, 0.025, M.walnut({ tint: '#4a2f1e' }), 0.004); p.position.set(x - sx * 0.012, 1.05 / 2, zc); p.rotation.y = ry; shell.add(p);
        const rail = F.rbox(len, 0.05, 0.05, M.walnut(), 0.01); rail.position.set(x - sx * 0.025, 1.05, zc); rail.rotation.y = ry; shell.add(rail);
      }
    };
    cutWall('west', [{ z: BAIZE.z, w: BAIZE.w, h: BAIZE.h }, { z: PARLOUR.z, w: PARLOUR.w, h: PARLOUR.h }]);
    cutWall('east', [{ z: CONS.z, w: CONS.dw * 2, h: CONS.dh }]);
    mergeStatic(shell, [shell.userData.floor, shell.userData.ceiling, ...Object.values(shell.userData.walls), ...cutPanels]);
    this.shell = shell;
  }

  _buildLights() {
    const G = this.group;
    G.add(L.ambientRig({ sky: '#9fb0ff', ground: '#1a100c', hemi: 0.6, ambient: '#3a3040', ambientIntensity: 0.55 }));
    // moonlight through the fanlight, falling north across the tiles
    const moon = L.keyLight({ color: '#9fb6ff', intensity: 14, position: [0.3, 3.9, 3.3], target: [0.2, 0, -1.4], angle: 0.5, penumbra: 0.7, distance: 14, castShadow: true });
    G.add(moon);
    this.moonLight = moon.userData.light;
    // a weak fill from the stair top (the dark upstairs)
    const fill = new THREE.PointLight('#5a6a9a', 1.6, 8, 2); fill.position.set(1.2, 3.4, -2.6); G.add(fill);
    const warm = new THREE.PointLight('#ffb070', 2.4, 7, 2); warm.position.set(2.2, 1.6, 1.1); G.add(warm);
    // a cold wash on the stair and the panelling under it, so the cupboard reads from the door
    const stairWash = new THREE.PointLight('#aab4d8', 4.5, 8, 2); stairWash.position.set(-0.6, 2.6, -1.2); G.add(stairWash);
    const cupLamp = new THREE.PointLight('#ffd0a0', 2.6, 3.6, 2); cupLamp.position.set(-0.2, 1.4, -1.5); G.add(cupLamp);
    const doorWash = new THREE.PointLight('#9fb6ff', 2.0, 6, 2); doorWash.position.set(0.2, 2.4, 2.4); G.add(doorWash);
    const westWash = new THREE.PointLight('#c9b090', 1.2, 6, 2); westWash.position.set(-2.2, 2.2, 0.2); G.add(westWash);
    // the landing: a candle on a bracket by the sampler, warm and small
    const landLamp = new THREE.PointLight('#ffc890', 2.2, 4.5, 2); landLamp.position.set(2.0, LAND.y + 1.35, -3.1); G.add(landLamp);
  }

  // ───────────────────────────────────────────────── south: front door, fanlight (the name), coat stand, the plan
  _buildSouth() {
    const G = this.group, { ctx } = this;
    const door = F.door({ w: 1.2, h: 2.1, tint: '#3a2418', bands: false, rune: false, frame: 'wood', seed: 4 });
    door.position.set(0.2, 0, D / 2 - 0.02); door.rotation.y = Math.PI; G.add(door);
    const fan = F.windowFrame({ w: 1.3, h: 0.66, arch: true, panes: [3, 1], frameMaterial: M.walnut({ tint: '#2e1e16' }), sill: false, rain: 0.2, moonlight: true, shaftTarget: [0.2, 0, -1.2], shaftOpacity: 0.1, skyTop: '#070a1c', skyBottom: '#141d3f', moon: [0.5, 0.62] });
    fan.position.set(0.2, 2.22, D / 2 - 0.04); fan.rotation.y = Math.PI; G.add(fan);
    this.fanlight = fan;
    this._hs({
      id: 'foyer.frontdoor', object: door, label: 'Front door', enabled: () => this._inHall(),
      onClick: () => { ctx.audio.play('zap', { gain: 0.35, pitch: 0.6 }); ctx.camera.shake(0.01, 0.3); ctx.dialogue.say('react.frontdoor'); },
      useItem: { bonekey: () => { ctx.audio.play('error', { gain: 0.5 }); ctx.dialogue.say('react.frontdoor.key'); } },
    });
    this._hs({ id: 'foyer.fanlight', object: fan, label: 'Fanlight', highlight: false, onClick: () => this._cloud() });
    // the house's name, leaded into the glass for the street: from in here it runs backwards
    const name = makeCanvasPlane(0.92, 0.26, (g, w, h) => drawFanName(g, w, h), { px: 256, emissive: true, transparent: true });
    name.position.set(0, 0.3, 0.028); name.material.depthWrite = false; name.renderOrder = 2; fan.add(name);
    this.fanName = name;
    this._hs({ id: 'foyer.fanlight.name', object: name, label: 'Letters in the glass', onClick: () => ctx.dialogue.caption('caption.fanlight.name', { duration: 6 }) });
    // coat stand with one coat
    const stand = new THREE.Group(); stand.position.set(-2.4, 0, 2.9); G.add(stand);
    const pole = F.lathe([[0.18, 0], [0.18, 0.03], [0.05, 0.05], [0.03, 1.7], [0.05, 1.78], [0.02, 1.86], [0, 1.9]], M.walnut({ tint: '#2a1a12' }), 14); stand.add(pole);
    for (let i = 0; i < 4; i++) {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI), M.brass()); hook.position.set(0, 1.68, 0); hook.rotation.y = (i / 4) * TAU; hook.rotation.x = Math.PI / 2; hook.translateY(-0.05); stand.add(hook);
    }
    const coat = F.lathe([[0.02, 1.7], [0.14, 1.6], [0.18, 1.2], [0.2, 0.7], [0.19, 0.62]], new THREE.MeshStandardMaterial({ color: '#1e1a22', roughness: 0.98, side: THREE.DoubleSide }), 18);
    coat.position.set(0.06, 0, 0.06); coat.scale.set(1, 1, 0.6); stand.add(coat);
    this._hs({ id: 'foyer.coat', object: coat, label: 'A coat', onClick: () => ctx.dialogue.caption('caption.coat') });
    // the floor plan: a framed drawing by the front door
    const plan = F.pictureFrame({ w: 0.44, h: 0.36, border: 0.03, depth: 0.03, style: 'wood', px: 512, draw: (g, w, h) => drawPlanSketch(g, w, h) });
    plan.position.set(1.4, 1.75, D / 2 - 0.035); plan.rotation.y = Math.PI; G.add(plan);
    this._hs({
      id: 'foyer.plan', object: plan, label: 'A plan of the house', enabled: () => this._inHall(),
      // the memorial's plan; once the house has called it marks the baize door and the way down
      // the caption is part of the paper (Papers hides captions while a paper is up, so after it was too late)
      onClick: () => {
        const def = ctx.memorial.planPaper({ called: !!this.house.called && !this.house.up });
        const note = ctx.dialogue.resolve('caption.plan').map((l) => l.text).join(' ');
        return ctx.papers.show({ ...def, html: `<div class="oc-plan-foot"><em>${note}</em></div>${def.html}` });
      },
    });
  }

  _cloud() {
    const { ctx } = this;
    if (this._clouding) return;
    this._clouding = true;
    ctx.dialogue.caption('caption.fanlight');
    const l = this.moonLight, base = l.intensity;
    const nm = this.floorName.material, nameBase = this._floorNameOpacity;
    ctx.tween.to(nm, { opacity: nameBase * 0.12 }, { duration: 1.6, ease: 'inOutSine' }).then(() => ctx.tween.to(nm, { opacity: nameBase }, { duration: 2.4, ease: 'inOutSine', delay: 1.0 }));
    ctx.tween.to(l, { intensity: base * 0.25 }, { duration: 1.6, ease: 'inOutSine' }).then(() => ctx.tween.to(l, { intensity: base }, { duration: 2.4, ease: 'inOutSine', delay: 1.0 })).then(() => { this._clouding = false; });
  }

  /** By moonlight the name lies the right way round on the tiles, where the shaft from the fanlight lands. */
  _buildFloorName() {
    const { ctx } = this;
    const plane = makeCanvasPlane(1.35, 0.62, (g, w, h) => drawFloorName(g, w, h), { px: 512, emissive: true, transparent: true });
    plane.material.depthWrite = false; plane.renderOrder = 1;
    this._floorNameOpacity = 0.85; plane.material.opacity = this._floorNameOpacity;
    plane.rotation.x = -Math.PI / 2; plane.position.set(0.15, 0.007, 0.6);
    this.group.add(plane);
    this.floorName = plane;
    this._hs({ id: 'foyer.name.floor', object: plane, label: 'Moonlight on the tiles', highlight: false, enabled: () => this._inHall(), onClick: () => ctx.dialogue.caption('caption.name.floor', { duration: 6 }) });
  }

  // ───────────────────────────────────────────────── north: the stair, the rope, and the cupboard under it
  _buildStair() {
    const G = this.group, { ctx } = this;
    const S = STAIR;
    const wood = M.walnut({ tint: '#3a2418' });
    const dark = M.walnut({ tint: '#241510' });
    const stair = new THREE.Group(); stair.name = 'stair'; G.add(stair);
    // treads and risers, rising to the east along the north wall
    for (let i = 0; i < S.steps; i++) {
      const x = S.x0 + i * S.run, y = i * S.rise;
      const tread = F.rbox(S.run + 0.03, 0.04, S.w, wood, 0.006); tread.position.set(x + S.run / 2, y + S.rise - 0.02, S.z0 + S.w / 2); stair.add(tread);
      const riser = F.rbox(0.02, S.rise, S.w, dark, 0.004); riser.position.set(x, y + S.rise / 2, S.z0 + S.w / 2); stair.add(riser);
    }
    // the landing at the top, filling the north-east corner
    const topX = LAND.x0, topY = S.steps * S.rise, landW = LAND.x1 - LAND.x0;
    const landing = F.rbox(landW, 0.06, S.w, wood, 0.008); landing.position.set(topX + landW / 2, LAND.y - 0.03, S.z0 + S.w / 2); stair.add(landing);
    // stringer and the panelled face under the stair, open to the hall (south)
    const face = new THREE.Shape();
    face.moveTo(S.x0, 0); face.lineTo(LAND.x1, 0); face.lineTo(LAND.x1, topY + S.rise - 0.04); face.lineTo(topX, topY + S.rise - 0.04); face.lineTo(S.x0 + 0.1, 0.0);
    const CUP = { cx: -0.35, cw: 0.7, ch: 0.9, y: 0.12 };
    const hole = new THREE.Path();
    hole.moveTo(CUP.cx - CUP.cw / 2 + 0.01, CUP.y + 0.01); hole.lineTo(CUP.cx + CUP.cw / 2 - 0.01, CUP.y + 0.01); hole.lineTo(CUP.cx + CUP.cw / 2 - 0.01, CUP.y + CUP.ch - 0.01); hole.lineTo(CUP.cx - CUP.cw / 2 + 0.01, CUP.y + CUP.ch - 0.01); hole.closePath();
    face.holes.push(hole);
    const faceGeo = new THREE.ExtrudeGeometry(face, { depth: 0.05, bevelEnabled: false });
    const panel = new THREE.Mesh(faceGeo, M.oak({ tint: '#7a5a38', planks: 10, repeat: [2, 2] })); panel.position.z = S.z0 + S.w; panel.castShadow = true; panel.receiveShadow = true; this._stairPanel = panel;
    // the underside, so the cavity reads as closed
    const under = new THREE.Mesh(faceGeo, dark); under.position.z = S.z0 - 0.0; under.scale.z = 0.4; stair.add(under);
    // handrail and newel posts
    // the rail, newel and balusters go in one group with the tread proxy, so a click on any of them is the stair
    const way = new THREE.Group(); way.name = 'stairWay'; stair.add(way); way.add(this._stairPanel);
    const newel = F.lathe([[0.06, 0], [0.06, 0.9], [0.045, 0.95], [0.05, 1.02], [0.03, 1.06], [0, 1.1]], dark, 12); newel.position.set(S.x0 - 0.02, 0, S.z0 + S.w + 0.05); way.add(newel);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(S.steps * S.run, topY) + 0.1, 10), wood);
    rail.position.set(S.x0 + (S.steps * S.run) / 2, topY / 2 + 0.95, S.z0 + S.w + 0.05); rail.rotation.z = Math.PI / 2 - Math.atan2(topY, S.steps * S.run); way.add(rail);
    for (let i = 1; i < S.steps; i += 1) {
      const x = S.x0 + i * S.run + 0.05, y = i * S.rise;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.9, 8), dark); b.position.set(x, y + 0.45 + 0.02, S.z0 + S.w + 0.05); way.add(b);
    }
    // the velvet rope across the third step: it hangs from the near post once unhooked
    const rope = new THREE.Group(); rope.position.set(S.x0 + 2.5 * S.run, 2 * S.rise, S.z0); stair.add(rope);
    for (const z of [0.05, S.w + 0.05]) { const post = F.lathe([[0.06, 0], [0.06, 0.02], [0.012, 0.04], [0.012, 0.8], [0.03, 0.82], [0, 0.86]], M.brass(), 12); post.position.set(0, 0, z); rope.add(post); }
    const swing = new THREE.Group(); swing.position.set(0, 0.8, 0.05); rope.add(swing);
    const ropeCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.18, S.w / 2), new THREE.Vector3(0, 0, S.w));
    const ropeMesh = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 16, 0.02, 8, false), M.velvet({ color: '#6e1d1f' })); swing.add(ropeMesh);
    const ropeEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.022, 0.05, 10), M.brass()); ropeEnd.position.set(0, 0, S.w); ropeEnd.rotation.x = Math.PI / 2; swing.add(ropeEnd);
    this.rope = { group: rope, swing };
    const ropeProxy = ctx.hotspots.proxyBox(0.16, 1.0, S.w + 0.16); ropeProxy.position.set(0, 0.5, S.w / 2 + 0.05); rope.add(ropeProxy);
    this._hs({
      id: 'foyer.rope', object: rope, label: () => (this.ropeDown ? 'Up the stair' : 'Velvet rope'), enabled: () => this._inHall(),
      onClick: () => (this.ropeDown ? this._goUp() : this._unhookRope()),
    });
    // the stair itself: a slanted proxy over the treads. Before the rope comes down it only answers; after, it is the way up (and down)
    const len = Math.hypot(S.steps * S.run, topY);
    const treadProxy = ctx.hotspots.proxyBox(len, 0.14, S.w); treadProxy.position.set(S.x0 + (S.steps * S.run) / 2, topY / 2 + 0.1, S.z0 + S.w / 2); treadProxy.rotation.z = Math.atan2(topY, S.steps * S.run); way.add(treadProxy);
    this._hs({
      id: 'foyer.stair', object: way, label: () => (this._onLanding ? 'Down' : this.ropeDown ? 'Up the stair' : 'Stair'), highlight: false,
      onClick: () => { if (this._onLanding) return this._goDown(); if (!this.ropeDown) return ctx.dialogue.say('react.stair'); return this._goUp(); },
    });

    // the cupboard: a small door in the panelled face, held by a bent nail through a hasp
    const cup = new THREE.Group(); cup.name = 'cupboard';
    const { cx, cw, ch } = CUP;
    cup.position.set(cx, CUP.y, S.z0 + S.w + 0.05); G.add(cup);
    // cavity
    const cavMat = new THREE.MeshStandardMaterial({ color: '#2a1c14', roughness: 1, side: THREE.BackSide });
    const cav = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.02, ch - 0.02, 0.6), cavMat);
    cav.position.set(0, ch / 2, -0.3 - 0.05); cup.add(cav);
    const shelfB = F.rbox(cw - 0.04, 0.02, 0.5, M.oak({ tint: '#5a4028' }), 0.003); shelfB.position.set(0, 0.0, -0.3); cup.add(shelfB);
    const leaf = new THREE.Group(); leaf.name = 'cupLeaf'; leaf.position.set(-cw / 2, 0, 0.01); cup.add(leaf);
    const leafMesh = F.rbox(cw, ch, 0.035, M.walnut({ tint: '#2e1a10', planks: 3 }), 0.006); leafMesh.position.set(cw / 2, ch / 2, 0); leaf.add(leafMesh);
    const leafTrim = F.rbox(cw - 0.1, ch - 0.1, 0.012, M.walnut({ tint: '#4a2e1a' }), 0.004); leafTrim.position.set(cw / 2, ch / 2, 0.022); leaf.add(leafTrim);
    const plateB = F.rbox(0.07, 0.11, 0.004, M.brass(), 0.002); plateB.position.set(cw - 0.08, ch / 2, 0.03); leaf.add(plateB);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), M.brass()); knob.position.set(cw - 0.08, ch / 2, 0.025); leaf.add(knob);
    // hasp on the leaf, staple on the frame, the nail through both
    const hasp = F.rbox(0.14, 0.03, 0.008, M.iron(), 0.002); hasp.position.set(cw + 0.0, ch * 0.62, 0.03); leaf.add(hasp);
    const staple = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), M.iron()); staple.position.set(cw / 2 + 0.05, ch * 0.62, 0.035); cup.add(staple);
    const nail = new THREE.Group(); nail.name = 'nail';
    const nailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.09, 8), M.iron({ color: '#6a6660' })); nailMesh.rotation.z = 0.35; nailMesh.position.y = -0.03; nail.add(nailMesh);
    const nailHead = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 10), M.iron({ color: '#6a6660' })); nailHead.position.y = 0.015; nail.add(nailHead);
    nail.position.set(cw / 2 + 0.05, ch * 0.62 + 0.03, 0.05); cup.add(nail);
    // the lantern inside
    const lantern = lanternProp(); lantern.position.set(0.02, 0.012, -0.25); lantern.scale.setScalar(0.95); cup.add(lantern);
    const cupLight = new THREE.PointLight('#ffb15a', 0, 1.8, 2); cupLight.position.set(0, 0.45, -0.15); cup.add(cupLight);
    // before it is opened, the lit lantern shows as a warm thread down the leaf's free edge and a glint at its foot
    const glint = new THREE.Group(); glint.name = 'cupGlint'; cup.add(glint);
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const edgeLine = new THREE.Mesh(new THREE.PlaneGeometry(0.01, ch - 0.06), glintMat); edgeLine.position.set(cw / 2 + 0.002, ch / 2, 0.003); glint.add(edgeLine);
    const footLine = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.5, 0.005), glintMat); footLine.position.set(cw * 0.22, 0.003, 0.03); glint.add(footLine);
    const gc = makeCanvas(64, 64), gg = gc.getContext('2d'), grad = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,214,150,1)'); grad.addColorStop(0.25, 'rgba(255,170,80,0.55)'); grad.addColorStop(1, 'rgba(255,140,60,0)');
    gg.fillStyle = grad; gg.fillRect(0, 0, 64, 64);
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(gc), color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    spark.scale.setScalar(0.15); spark.position.set(cw / 2 + 0.004, 0.2, 0.09); glint.add(spark);
    for (const m of [edgeLine, footLine, spark]) m.userData.noRaycast = true;
    this.cup = { group: cup, leaf, nail, lantern, light: cupLight, staple, glint, glintMats: [glintMat, spark.material] };
    // House says react.cup.<verb> once onOpen resolves, so resolve as the nail starts to come out: the line about the
    // nail and the hasp reads while the nail drops and the little door swings, not after it has finished.
    const onOpen = async (verb) => {
      const { audio, tween } = ctx;
      if (verb !== 'ring') { audio.play('ratchet', { gain: 0.6, pitch: 0.7 }); }
      this.cup.glint.visible = false;
      const pull = tween.to(nail.position, { y: nail.position.y + 0.12 }, { duration: 0.35, ease: 'outQuad' });
      pull.then(async () => {
        await tween.to(nail.position, { y: -0.1, x: nail.position.x + 0.1 }, { duration: 0.5, ease: 'inQuad' });
        nail.visible = false;
        audio.play('drawerOpen', { gain: 0.6, pitch: 0.9 });
        tween.to(cupLight, { intensity: 1.6 }, { duration: 0.8 });
        await tween.to(leaf.rotation, { y: -1.9 }, { duration: 0.9, ease: 'outBack' });
      });
      await tween.delay(0.2);
    };
    const focus = () => {
      if (!this.house.isOpen('cup') && !this.house.canOpen('cup')) return this.house.focusLock('cup');
      return ctx.camera.focus({ position: [cx + 0.35, 0.75, S.z0 + S.w + 1.15], lookAt: [cx + 0.05, 0.5, S.z0 + S.w], scope: 'focus:foyer.cup', onExit: () => this.house.blurLock() })
        .then(() => this.house.focusLock('cup', { onOpen, stay: true }));
    };
    const force = () => this.house.open('cup', 'force', { onOpen, stay: true });
    this._hs({
      id: 'foyer.cup', object: leaf, label: () => (this.house.isOpen('cup') ? 'Cupboard' : 'Cupboard under the stair'), enabled: () => this._inHall(), scope: ['room', 'focus:foyer.cup'],
      onClick: async () => {
        if (this.house.isOpen('cup')) { if (this.house.lantern !== 'none') this._captionAfterLines('Empty now. A ring of soot where the lantern stood.'); else if (!ctx.camera.inFocus) focus(); return; }
        if (ctx.camera.scope === 'focus:foyer.cup') { this._captionAfterLines('caption.cup.door', { duration: 6, scope: 'focus:foyer.cup' }); return; }
        // the first close-up of a run says tallow.ways first (and then captions the verbs): this one waits its turn
        if ((await focus()) !== false && ctx.camera.scope === 'focus:foyer.cup') this._captionAfterLines('caption.cup.door', { duration: 6, scope: 'focus:foyer.cup', unlessShowing: true });
      },
      useItem: { bonekey: force, pliers: () => { if (!this.house.isOpen('cup')) this.house.open('cup', 'pick', { onOpen, stay: true }); } },
    });
    const nailProxy = ctx.hotspots.proxyBox(0.1, 0.14, 0.08); nailProxy.position.set(0, -0.02, 0); nail.add(nailProxy);
    this._hs({
      id: 'foyer.cup.nail', object: nail, label: 'Bent nail', scope: ['focus:foyer.cup', 'room'],
      enabled: () => !this.house.isOpen('cup') && this._inHall(),
      onClick: ({ item }) => { if (item === 'pliers') return; ctx.audio.play('error', { gain: 0.4 }); this._captionAfterLines('Bent over the staple and hammered flat. Fingers will not do it. Something glints in the gap behind it.'); },
      useItem: { pliers: () => this.house.open('cup', 'pick', { onOpen, stay: true }), bonekey: force },
    });
    this._hs({
      id: 'foyer.lantern', object: lantern, label: 'Lantern', scope: ['focus:foyer.cup', 'room'],
      enabled: () => this.house.isOpen('cup') && this.house.lantern === 'none' && this._inHall(),
      onClick: async () => {
        this.house.takeLantern();
        ctx.audio.play('pickup');
        ctx.inventory.add('lantern', { from: lantern });
        lantern.visible = false;
        ctx.tween.to(cupLight, { intensity: 0 }, { duration: 1.2 });
        this._carried.set(true);
        this._syncPainting(true);
        await ctx.dialogue.say('react.lantern.found');
        if (ctx.camera.inFocus) ctx.camera.exitFocus();
      },
    });
  }

  async _unhookRope() {
    const { ctx } = this;
    if (this.ropeDown || this._roping) return;
    this._roping = true;
    ctx.state.set('foyer.rope.down', true);
    ctx.audio.play('drop', { gain: 0.5, pitch: 0.7 });
    await ctx.tween.to(this.rope.swing.rotation, { x: 1.15 }, { duration: 0.9, ease: 'outBounce' });
    this._roping = false;
    await ctx.dialogue.say('react.rope');
  }

  // ───────────────────────────────────────────────── the camera walk up and down
  async _walkCam(legs) {
    const { ctx } = this;
    const steps = setInterval(() => ctx.audio.play('footstep', { gain: 0.3, pitch: 0.85 + Math.random() * 0.1 }), 440);
    try {
      for (const leg of legs) {
        leg.onStart?.();
        // the first leg takes the camera (unless a glance over the rail already has it); the rest move it on
        if (!ctx.camera.inFocus) { const p = ctx.camera.focus({ ...leg, scope: 'walk' }); ctx.hud.showBack(false); await p; }
        else { ctx.hud.showBack(false); await ctx.camera.refocus(leg); }
      }
    } finally { clearInterval(steps); }
  }
  async _goUp() {
    const { ctx } = this;
    if (this._walking || this._onLanding || !this.ropeDown) return;
    this._walking = true;
    ctx.hotspots.lock();
    try {
      if (ctx.camera.inFocus) await ctx.camera.exitFocus({ all: true });
      ctx.dialogue.hideCaption(); // a hall caption does not follow you up
      await this._walkCam([
        { position: [-2.25, 1.65, -1.75], lookAt: [0.6, 2.9, -2.95], duration: 1.5 },
        { position: [-1.25, 2.75, -2.95], lookAt: [1.6, 3.9, -2.95], duration: 1.7 },
        { position: LANDING_VANTAGE.position, lookAt: LANDING_VANTAGE.lookAt, duration: 1.6 },
      ]);
      this._setLanding(true);
      ctx.memorial.visit('landing');
    } finally { ctx.hotspots.unlock(); this._walking = false; }
    if (!ctx.state.get('foyer.stair.said')) { ctx.state.set('foyer.stair.said', true); await ctx.dialogue.say('react.stair.up'); }
  }
  /** Walk down to the hall. From the rail, first a look over it at the hall below, with its caption; the caption belongs
   *  to that look and goes the moment the walk starts. "Thirteen again" is captioned on the walk and goes with it. */
  async _goDown({ rail = false } = {}) {
    const { ctx } = this;
    if (this._walking || !this._onLanding) return;
    this._walking = true;
    ctx.hotspots.lock();
    try {
      if (ctx.camera.inFocus) await ctx.camera.exitFocus({ all: true });
      if (rail) {
        const look = ctx.camera.focus({ position: [1.0, LAND.y + 1.5, LAND.z1 - 0.05], lookAt: [1.2, 0.5, 0.4], scope: 'focus:foyer.rail', fov: 58, duration: 0.8 });
        ctx.hud.showBack(false); // the look is the first step of the walk down, not a close-up to back out of
        await look;
        ctx.dialogue.caption('caption.rail', { scope: 'focus:foyer.rail', duration: 3.4 });
        await ctx.tween.delay(2.6);
      }
      ctx.dialogue.hideCaption(); // nothing said on the landing follows you down
      // "Thirteen again" is the walk's own caption, in the walk's scope: it shows as you start down (only if no line is
      // up) and goes when the walk ends in the hall, so it can never turn up after you are already standing there
      const sayDown = () => {
        if (ctx.state.get('foyer.stair.down.said') || ctx.dialogue.busy) return;
        ctx.state.set('foyer.stair.down.said', true);
        ctx.dialogue.caption('react.stair.down', { duration: 4.6, scope: ctx.camera.scope });
      };
      await this._walkCam([
        { position: [-0.2, 3.3, -2.95], lookAt: [-2.9, 1.3, -2.0], duration: 1.4, onStart: () => queueMicrotask(sayDown) },
        { position: [-2.2, 1.65, -1.85], lookAt: [0.2, 1.3, 0.6], duration: 1.6 },
        { position: Foyer.vantage.position, lookAt: Foyer.vantage.lookAt, duration: 1.4 },
      ]);
      this._setLanding(false);
      ctx.dialogue.hideCaption();
    } finally { ctx.hotspots.unlock(); this._walking = false; }
  }
  /** Put the camera on the landing (true) or at the hall vantage (false). Instant; the walk tweens up to the same pose first. */
  _setLanding(on) {
    const { ctx } = this;
    this._onLanding = on;
    this.backLabel = on ? 'The hall' : null; // HUD Back (engine) shows this whenever no close-up is open; onBack() walks down
    ctx.state.set('foyer.landing', on);
    ctx.camera.setVantage(on ? LANDING_VANTAGE : Foyer.vantage);
  }

  // ───────────────────────────────────────────────── the landing: rail, sampler, the nursery door and its pegs
  _buildLanding() {
    const G = this.group, { ctx } = this;
    const wood = M.walnut({ tint: '#3a2418' }), dark = M.walnut({ tint: '#241510' });
    // the rail along the landing's edge over the hall, continuing the stair rail
    const land = new THREE.Group(); land.name = 'landing'; G.add(land);
    const rz = LAND.z1 + 0.05, ry = LAND.y + 0.95;
    const topNewel = F.lathe([[0.06, 0], [0.06, 0.9], [0.045, 0.95], [0.05, 1.02], [0.03, 1.06], [0, 1.1]], dark, 12); topNewel.position.set(LAND.x0 + 0.02, LAND.y, rz); land.add(topNewel);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, LAND.x1 - LAND.x0, 10), wood); rail.position.set((LAND.x0 + LAND.x1) / 2, ry, rz); rail.rotation.z = Math.PI / 2; land.add(rail);
    for (let x = LAND.x0 + 0.3; x < LAND.x1 - 0.1; x += 0.26) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.9, 8), dark); b.position.set(x, LAND.y + 0.47, rz); land.add(b); }
    // the way down, reachable from the landing's default view (which faces the nursery door): the rail, its balusters
    // and the drop to the hall beyond them all walk you down; so does the stair head behind you, and the treads below it.
    // Esc and the HUD's Back walk down too (onBack()).
    const toHall = new THREE.Group(); toHall.name = 'landingToHall'; land.add(toHall);
    const railProxy = ctx.hotspots.proxyBox(LAND.x1 - LAND.x0 + 0.1, 1.1, 0.16); railProxy.position.set((LAND.x0 + LAND.x1) / 2, LAND.y + 0.52, rz); toHall.add(railProxy);
    const dropProxy = ctx.hotspots.proxyBox(LAND.x1 - LAND.x0 + 1.4, LAND.y + 0.2, 0.06); dropProxy.position.set((LAND.x0 + LAND.x1) / 2 - 0.7, (LAND.y + 0.2) / 2, rz + 0.3); toHall.add(dropProxy);
    this._hs({ id: 'foyer.rail', object: toHall, label: 'Down to the hall', highlight: rail, enabled: () => this._onLanding, onClick: () => this._goDown({ rail: true }) });
    const toStair = new THREE.Group(); toStair.name = 'landingToStair'; land.add(toStair);
    const headProxy = ctx.hotspots.proxyBox(0.9, 1.3, LAND.z1 - LAND.z0 + 0.1); headProxy.position.set(LAND.x0 + 0.05, LAND.y + 0.6, (LAND.z0 + LAND.z1) / 2); toStair.add(headProxy);
    const S = STAIR, run = S.steps * S.run, rise = S.steps * S.rise;
    const slab = ctx.hotspots.proxyBox(Math.hypot(run, rise), 0.8, S.w); // over the treads, standing proud of them so they cannot hide it
    slab.position.set(S.x0 + run / 2, S.rise + rise / 2 + 0.38, S.z0 + S.w / 2); slab.rotation.z = Math.atan2(rise, run); toStair.add(slab);
    this._hs({ id: 'foyer.landing.down', object: toStair, label: 'Down the stair', highlight: false, enabled: () => this._onLanding, onClick: () => this._goDown() });
    // a candle on a bracket by the sampler
    const bracket = F.rbox(0.18, 0.02, 0.12, dark, 0.004); bracket.position.set(1.35, LAND.y + 1.12, -3.44); land.add(bracket);
    const candle = F.candle({ h: 0.1, r: 0.018, holder: 'dish', light: true, intensity: 0.6, distance: 2.5, lit: true, color: '#ffb070', castShadow: false }); candle.position.set(1.35, LAND.y + 1.13, -3.44); land.add(candle);
    // the sampler under glass, hung on a nail
    const sampler = new THREE.Group(); sampler.position.set(2.05, LAND.y + 1.0, -D / 2 + 0.035); land.add(sampler);
    const frame = F.pictureFrame({ w: 0.52, h: 0.4, border: 0.03, depth: 0.03, style: 'wood', px: 1024, draw: (g, w, h) => drawSampler(g, w, h) });
    sampler.add(frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.35), M.glass({ color: '#d8e0ff', opacity: 0.07, roughness: 0.1 })); glass.position.z = 0.032; glass.renderOrder = 3; glass.userData.noRaycast = true; sampler.add(glass);
    const nailS = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), M.iron({ color: '#6a6660' })); nailS.rotation.x = Math.PI / 2; nailS.position.set(0, 0.23, 0.0); land.add(nailS); nailS.position.add(sampler.position);
    this.sampler = sampler;
    // the whole frame and a margin round it answers, so it can be found from the hall, where it is small and high
    const samplerProxy = ctx.hotspots.proxyBox(0.72, 0.58, 0.08); samplerProxy.position.set(0, 0, 0.03); sampler.add(samplerProxy);
    this._hs({
      id: 'foyer.sampler', object: samplerProxy, highlight: frame, label: () => (this._onLanding ? 'Sampler' : 'Something stitched'),
      onClick: async () => {
        if (!this._onLanding) { ctx.dialogue.caption('caption.sampler.far'); return; }
        const p = sampler.position;
        glass.visible = false; // the glass only fogs it, this close
        await ctx.camera.focus({ position: [p.x, p.y, p.z + 0.62], lookAt: [p.x, p.y, p.z], scope: 'focus:foyer.sampler', fov: 38, onExit: () => { glass.visible = true; ctx.dialogue.hideCaption(); } });
        ctx.dialogue.caption('caption.sampler', { duration: 9, scope: 'focus:foyer.sampler' });
      },
    });

    // the nursery door, at child height on the east wall
    const door = stripDoorHardware(F.door({ w: 0.8, h: 1.45, tint: '#4a3426', bands: false, rune: false, frame: 'wood', seed: 8 }));
    door.position.set(W / 2 - 0.02, LAND.y, -2.95); door.rotation.y = -Math.PI / 2; land.add(door);
    const leaf = door.userData.leaf;
    const beyond = door.children[0]; // the dark behind the leaf, pulled in front of the shell's wall
    beyond.position.z = -0.012;
    beyond.material = new THREE.MeshStandardMaterial({ color: '#2a1c16', emissive: '#4a2c1c', emissiveIntensity: 0, roughness: 1 });
    const brass = M.brass({ polished: true }), brassDull = M.brass();
    const T = 0.035; // the leaf's front face
    // the knocker: a boss and a ring
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 16), brassDull); boss.rotation.x = Math.PI / 2; boss.position.set(0.3, 0.92, T + 0.006); leaf.add(boss);
    const knocker = new THREE.Group(); knocker.position.set(0.3, 0.92, T + 0.012); leaf.add(knocker);
    const kRing = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 10, 24), brass); kRing.position.set(0, -0.034, 0.012); knocker.add(kRing);
    const kProxy = ctx.hotspots.proxyBox(0.12, 0.12, 0.06); kProxy.position.set(0, -0.03, 0.01); knocker.add(kProxy);
    // the pegs: four, in slots on a brass plate beside the knocker, all down
    const plate = F.rbox(0.2, 0.11, 0.008, brassDull, 0.003); plate.position.set(0.56, 0.92, T + 0.004); leaf.add(plate);
    const pegs = [];
    for (let i = 0; i < 4; i++) {
      const x = 0.49 + i * 0.047;
      const slot = F.rbox(0.014, 0.075, 0.004, M.matte('#1a1208'), 0.001); slot.position.set(x, 0.92, T + 0.009); leaf.add(slot);
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 12), brass); peg.rotation.x = Math.PI / 2; peg.position.set(x, 0.895, T + 0.022); leaf.add(peg);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 8), brass); cap.position.set(x, 0.895, T + 0.037); leaf.add(cap);
      pegs.push({ peg, cap, y0: 0.895, up: 0.05 });
    }
    // the bolt, on the free edge, drawn when the pegs are all up
    const keep = F.rbox(0.05, 0.03, 0.02, brassDull, 0.003); keep.position.set(0.76, 1.05, T + 0.01); leaf.add(keep);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 10), brass); bolt.rotation.z = Math.PI / 2; bolt.position.set(0.8, 1.05, T + 0.012); leaf.add(bolt);
    const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.007, 12), M.matte('#060402')); keyhole.position.set(0.44, 0.92, T + 0.002); keyhole.visible = false; leaf.add(keyhole);
    const beyondLight = new THREE.PointLight('#ffb080', 0, 2.5, 2); beyondLight.position.set(0.4, 0.8, -0.5); door.add(beyondLight);
    this.nursery = { door, leaf, pegs, bolt, keyhole, knocker, beyondLight, beyond };

    const setPeg = (i, up, dur = 0.16) => { const p = pegs[i]; const y = up ? p.y0 + p.up : p.y0; return Promise.all([ctx.tween.to(p.peg.position, { y }, { duration: dur, ease: up ? 'outBack' : 'inQuad' }), ctx.tween.to(p.cap.position, { y }, { duration: dur, ease: up ? 'outBack' : 'inQuad' })]); };
    const drawBolt = (dur = 0.5) => { ctx.audio.play('bookSlide', { gain: 0.5, pitch: 1.3 }); return ctx.tween.to(bolt.position, { x: 0.69 }, { duration: dur, ease: 'inOutCubic' }); };
    const K = this._knock = { count: 0, last: 0, timer: null, hush: null };
    const clearKnock = () => { clearTimeout(K.timer); clearTimeout(K.hush); K.timer = K.hush = null; };
    const dropPegs = (quiet = false) => {
      clearKnock();
      const had = K.count; K.count = 0; K.last = 0;
      if (!had) return;
      ctx.audio.play('click', { gain: quiet ? 0.3 : 0.6, pitch: 0.7 });
      for (let i = 0; i < 4; i++) setPeg(i, false, 0.12);
      if (!quiet) ctx.dialogue.caption('caption.pegs.drop', { duration: 2.5 });
    };
    this._dropPegs = dropPegs;
    const onOpen = async (verb) => {
      clearKnock(); K.count = 0;
      if (verb === 'force') {
        keyhole.visible = true;
        ctx.audio.play('click', { gain: 0.6, pitch: 0.6 });
        await Promise.all(pegs.map((_, i) => setPeg(i, false, 0.14)));
        // the sampler slips a quarter inch on its nail
        ctx.audio.play('drop', { gain: 0.3, pitch: 1.6 });
        ctx.tween.to(sampler.position, { y: sampler.position.y - 0.006 }, { duration: 0.25, ease: 'outBounce' });
        await ctx.tween.to(sampler.rotation, { z: -0.035 }, { duration: 0.3, ease: 'outBounce' });
      } else if (verb === 'ring') {
        await this._finishClimb();
        for (let i = 0; i < 4; i++) { setPeg(i, true); await ctx.tween.delay(0.18); }
      }
      if (bolt.position.x > 0.7) await drawBolt(0.5);
      ctx.audio.play('unlock', { gain: 0.6, pitch: 1.2 });
      // the leaf swings out onto the landing, through where the close-up camera stands: pull back first (as the moons do)
      if (ctx.camera.scope === 'focus:foyer.landing') await ctx.camera.refocus({ position: LANDING_OPEN_VIEW.position, lookAt: LANDING_OPEN_VIEW.lookAt, fov: 55, duration: 0.7 });
      else await ctx.tween.delay(0.25);
      ctx.audio.play('doorOpen', { gain: 0.6, pitch: 1.15 });
      ctx.tween.to(beyondLight, { intensity: 1.6 }, { duration: 1.2 });
      ctx.tween.to(beyond.material, { emissiveIntensity: 0.6 }, { duration: 1.2 });
      await ctx.tween.to(leaf.rotation, { y: 1.5 }, { duration: 1.2, ease: 'outCubic' });
    };
    const lockW = () => leaf.localToWorld(new THREE.Vector3(0.46, 0.93, T));
    const focus = () => {
      if (!this.house.isOpen('landing') && !this.house.canOpen('landing')) return this.house.focusLock('landing');
      const l = lockW();
      return ctx.camera.focus({ position: [l.x - 0.6, l.y + 0.03, l.z + 0.06], lookAt: [l.x, l.y, l.z], scope: 'focus:foyer.landing', fov: 38, onExit: () => { this.house.blurLock(); dropPegs(true); } })
        .then(() => this.house.focusLock('landing', { onOpen, keep: true }));
    };
    const force = () => this.house.open('landing', 'force', { onOpen, keep: true });
    this._hs({
      // also in its close-up once open (the view is left pulled back on the open door): one click goes through
      id: 'foyer.landing', object: door, label: () => (this.house.isOpen('landing') ? 'The nursery' : 'Nursery door'), scope: ['room', 'focus:foyer.landing'],
      enabled: () => this._onLanding && (ctx.camera.scope === 'room' || this.house.isOpen('landing')),
      onClick: () => (this.house.isOpen('landing') ? this._go('nursery') : focus()),
      useItem: { bonekey: () => { if (!this.house.isOpen('landing')) force(); }, '*': () => ctx.dialogue.caption('caption.nope') },
    });
    const knock = () => {
      if (this.house.isOpen('landing')) return;
      const now = performance.now() / 1000;
      ctx.audio.play('whump', { gain: 0.55, pitch: 1.7 });
      ctx.tween.to(knocker.rotation, { x: 0.5 }, { duration: 0.06 }).then(() => ctx.tween.to(knocker.rotation, { x: 0 }, { duration: 0.14, ease: 'outBack' }));
      const dt = now - K.last;
      let ok;
      if (K.count === 0) ok = true;
      else if (K.count === 1) ok = dt <= KNOCK.quick;
      else if (K.count === 2) ok = dt > KNOCK.quick && dt < KNOCK.pauseMax;
      else ok = false; // a knock during the hush
      if (!ok) { dropPegs(); return; }
      clearKnock();
      K.last = now; K.count += 1;
      setPeg(K.count - 1, true);
      if (K.count === 1) K.timer = setTimeout(() => dropPegs(true), (KNOCK.quick + 0.1) * 1000);
      else if (K.count === 2) K.timer = setTimeout(() => dropPegs(true), (KNOCK.pauseMax + 0.1) * 1000);
      else if (K.count === 3) K.hush = setTimeout(async () => {
        if (this.house.isOpen('landing') || ctx.camera.scope !== 'focus:foyer.landing') return;
        K.count = 4;
        await setPeg(3, true, 0.3);
        this.house.open('landing', 'pick', { onOpen, keep: true });
      }, KNOCK.hush * 1000);
    };
    this._hs({ id: 'foyer.landing.knocker', object: kProxy, label: 'Knocker', scope: 'focus:foyer.landing', highlight: kRing, enabled: () => !this.house.isOpen('landing'), onClick: knock, useItem: { bonekey: force } });
    const pegProxy = ctx.hotspots.proxyBox(0.22, 0.13, 0.05); pegProxy.position.set(0.56, 0.92, T + 0.02); leaf.add(pegProxy);
    this._hs({ id: 'foyer.landing.pegs', object: pegProxy, label: 'Four brass pegs', scope: 'focus:foyer.landing', highlight: plate, enabled: () => !this.house.isOpen('landing'), onClick: () => ctx.dialogue.caption('Four pegs in four slots, all down. They are not for pulling.'), useItem: { bonekey: force } });
  }

  // ───────────────────────────────────────────────── west: the parlour door with its letter rings, the clock
  _buildWest() {
    const G = this.group, { ctx } = this;
    const door = stripDoorHardware(F.door({ w: PARLOUR.w, h: PARLOUR.h, tint: '#2e1e16', bands: false, rune: false, frame: 'wood', seed: 6 }));
    door.position.set(-W / 2 + 0.02, 0, PARLOUR.z); door.rotation.y = Math.PI / 2; G.add(door);
    const leaf = door.userData.leaf;
    // through the opening: a short passage (the leaf swings into it), the parlour's warmth on the far wall
    const passage = new THREE.Mesh(new THREE.BoxGeometry(PARLOUR.w + 0.16, PARLOUR.h, 1.5), new THREE.MeshStandardMaterial({ color: '#3a2418', roughness: 1, side: THREE.BackSide }));
    passage.position.set(0, PARLOUR.h / 2, -0.04 - 0.75); passage.userData.noHighlight = true; door.add(passage);
    const beyond = door.children[0]; beyond.position.set(0, PARLOUR.h / 2, -1.5); beyond.scale.set((PARLOUR.w + 0.16) / PARLOUR.w, 1, 1); beyond.userData.noHighlight = true;
    beyond.material = new THREE.MeshStandardMaterial({ color: '#160d08', emissive: '#c0602a', emissiveIntensity: 0, roughness: 1 });
    const beyondLight = new THREE.PointLight('#ffb070', 0, 3, 2); beyondLight.position.set(0, 1.3, -0.9); door.add(beyondLight);
    const T = 0.035;
    // the lock: where a handle should be, four brass rings lettered A to Z on a plate
    const lock = new THREE.Group(); lock.position.set(0.8, 1.02, T); leaf.add(lock);
    const plate = F.rbox(0.31, 0.135, 0.012, M.brass(), 0.004); plate.position.set(0, 0, 0.006); lock.add(plate);
    const vals = ctx.state.get('foyer.parlour.rings', RING_START);
    const strip = ringTexture();
    const pz = 0.012 + RING_R - 0.006, front = pz + RING_R; // drum axis depth; the drums' reading face
    const rings = vals.map((v, i) => {
      const pivot = new THREE.Group(); pivot.position.set(-0.105 + i * 0.07, 0, pz); pivot.rotation.z = Math.PI / 2; lock.add(pivot);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(RING_R, RING_R, RING_L, 52, 1, false), [
        new THREE.MeshStandardMaterial({ map: strip, roughness: 0.4, metalness: 0.7, emissive: '#5a4420', emissiveIntensity: 0.35 }), M.brass({ polished: true }), M.brass({ polished: true })]);
      mesh.castShadow = true; mesh.userData.value = v; mesh.userData.turn = v; mesh.rotation.y = ringAngle(v); pivot.add(mesh);
      return mesh;
    });
    // the reading window: shade over the letters above and below, a brass bracket round the line, a pointer at each end
    const cellH = TAU * RING_R / 26, win = cellH * 0.62;
    const shadeMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.74, depthWrite: false });
    for (const sgn of [1, -1]) {
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(0.29, RING_R - win), shadeMat);
      shade.position.set(0, sgn * (win + (RING_R - win) / 2), front + 0.0015); shade.renderOrder = 2; shade.userData.noRaycast = true; lock.add(shade);
      const bar = F.rbox(0.27, 0.0032, 0.004, M.brass({ polished: true }), 0.001); bar.position.set(0, sgn * (win + 0.0016), front + 0.003); bar.userData.noRaycast = true; lock.add(bar);
    }
    for (const sgn of [-1, 1]) {
      const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(sgn * 0.014, 0.009); tri.lineTo(sgn * 0.014, -0.009); tri.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri), M.brass({ polished: true })); arrow.position.set(sgn * -0.137, 0, front + 0.003); arrow.userData.noRaycast = true; lock.add(arrow);
    }
    const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.007, 12), M.matte('#060402')); keyhole.position.set(0, -0.06, 0.013); keyhole.visible = false; lock.add(keyhole);
    this.parlour = { door, leaf, rings, keyhole, beyond, beyondLight, lock };
    const onOpen = async (verb) => {
      if (verb === 'force') {
        keyhole.visible = true;
        ctx.audio.play('click', { gain: 0.5, pitch: 0.6 });
        // pull back so the tiles are in shot; the rings fall while the force line plays, and the door opens after them
        if (ctx.camera.scope === 'focus:foyer.parlour') {
          // above the dialogue box: the rings land on the tiles just inside the door, about PARLOUR.z
          await ctx.camera.refocus({ position: [-W / 2 + 1.75, 1.85, PARLOUR.z - 0.1], lookAt: [-W / 2 + 0.45, 0.2, PARLOUR.z - 0.15], fov: 60, duration: 0.7 });
        } else await ctx.tween.delay(0.3);
        const drops = this._dropRings();
        await ctx.tween.delay(0.5);
        // then, as the door swings, up off the tiles to the doorway (the view the close-up is left on: keep)
        drops.then(() => {
          if (ctx.camera.scope === 'focus:foyer.parlour') ctx.camera.refocus({ ...PARLOUR_OPEN_VIEW, fov: 55, duration: 0.9 });
          swing();
        });
        return;
      }
      // from the ring close-up, pull back to frame the doorway (the leaf swings away from the lock): the view stays here
      // after the line (keep), so the open door is one click from the close-up
      if (ctx.camera.scope === 'focus:foyer.parlour') await ctx.camera.refocus({ ...PARLOUR_OPEN_VIEW, fov: 55, duration: 0.7 });
      await swing();
    };
    const swing = async () => {
      ctx.audio.play('unlock', { gain: 0.7 });
      await ctx.tween.delay(0.3);
      ctx.audio.play('doorOpen', { gain: 0.7, pitch: 0.85 });
      ctx.tween.to(beyondLight, { intensity: 1.2 }, { duration: 1.6 });
      ctx.tween.to(beyond.material, { emissiveIntensity: 0.5 }, { duration: 1.6 });
      await ctx.tween.to(leaf.rotation, { y: 1.55 }, { duration: 1.6, ease: 'outCubic' });
    };
    const lockW = () => lock.localToWorld(new THREE.Vector3(0, 0.0, 0.04));
    const focus = () => {
      if (!this.house.isOpen('parlour') && !this.house.canOpen('parlour')) return this.house.focusLock('parlour');
      const l = lockW();
      return ctx.camera.focus({ position: [l.x + 0.4, l.y + 0.015, l.z + 0.015], lookAt: [l.x, l.y, l.z], scope: 'focus:foyer.parlour', fov: 40, onExit: () => this.house.blurLock() })
        .then(() => this.house.focusLock('parlour', { onOpen, keep: true }));
    };
    const force = () => this.house.open('parlour', 'force', { onOpen, keep: true });
    this._hs({
      id: 'foyer.parlour', object: door, label: () => (this.house.isOpen('parlour') ? 'The parlour' : 'Parlour door'), scope: ['room', 'focus:foyer.parlour'],
      enabled: () => this._inHall() && (ctx.camera.scope === 'room' || this.house.isOpen('parlour')),
      onClick: () => (this.house.isOpen('parlour') ? this._go('parlour') : focus()),
      useItem: { bonekey: () => { if (!this.house.isOpen('parlour')) force(); }, '*': () => ctx.dialogue.say('react.parlour') },
    });
    // each drum has two halves: the upper one brings the next letter (the one showing above the line) down into it,
    // the lower one brings the previous letter up. Any letter is at most 13 clicks away.
    const turn = (mesh, i, dir) => {
      mesh.userData.turn += dir;
      mesh.userData.value = ((mesh.userData.turn % 26) + 26) % 26;
      ctx.audio.play('ratchet', { gain: 0.5, pitch: (dir > 0 ? 1.2 : 1.05) + i * 0.06 });
      ctx.tween.to(mesh.rotation, { y: ringAngle(mesh.userData.turn) }, { duration: 0.2, ease: 'outBack' });
      ctx.state.set('foyer.parlour.rings', rings.map((r) => r.userData.value));
      if (rings.every((r, j) => r.userData.value === ROOK[j])) this.house.open('parlour', 'pick', { onOpen, keep: true });
    };
    rings.forEach((mesh, i) => {
      for (const [dir, half] of [[1, 'up'], [-1, 'down']]) {
        const proxy = ctx.hotspots.proxyBox(0.064, RING_R + 0.012, 0.03); proxy.position.set(mesh.parent.position.x, dir * (RING_R + 0.012) / 2, front - 0.01); lock.add(proxy);
        this._hs({
          id: `foyer.parlour.ring${i}.${half}`, object: proxy, label: () => `Ring: ${LETTERS[mesh.userData.value]}, turn ${half}`, scope: 'focus:foyer.parlour', highlight: mesh,
          enabled: () => !this.house.isOpen('parlour'),
          onClick: () => turn(mesh, i, dir),
          useItem: { bonekey: force },
        });
      }
    });

    const clock = grandfatherClock(); clock.position.set(-W / 2 + 0.22, 0, -1.5); clock.rotation.y = Math.PI / 2; G.add(clock);
    const ud = clock.userData;
    mergeStatic(clock, [ud.hourHand, ud.minuteHand, ud.pendulum, ud.panel, ud.keySpot, ud.face]);
    this.clock = clock;
    this._hs({ id: 'foyer.clock', object: clock, label: 'Hall clock', onClick: () => {
      if (!(this.house.s.clock > 0)) return ctx.dialogue.say('react.clock');
      const [l, ...rest] = ctx.dialogue.resolve('react.clock.running');
      return ctx.dialogue.say([{ ...l, text: `${this.house.clockText()}. ${l.text}` }, ...rest]);
    } });
  }

  /** The rings come off one by one and fall to the tiles (the force; also restored that way). */
  async _dropRings(instant = false) {
    const { ctx } = this;
    const { door, rings } = this.parlour;
    const r = rng(9);
    for (let i = 0; i < rings.length; i++) {
      const pivot = rings[i].parent;
      if (pivot.parent !== door) door.attach(pivot);
      const to = { x: -0.2 + i * 0.14 + (r() - 0.5) * 0.08, y: 0.032, z: 0.25 + r() * 0.3 };
      if (instant) { pivot.position.set(to.x, to.y, to.z); pivot.rotation.set(0, r() * TAU, Math.PI / 2 + 0.3); continue; }
      ctx.audio.play('click', { gain: 0.4, pitch: 1.5 });
      ctx.tween.to(pivot.rotation, { y: r() * 2, z: Math.PI / 2 + 0.3 }, { duration: 0.55 });
      await ctx.tween.to(pivot.position, { x: to.x, z: to.z }, { duration: 0.55, ease: 'outQuad' });
      ctx.audio.play('drop', { gain: 0.5, pitch: 1.6 + i * 0.1 });
      await ctx.tween.to(pivot.position, { y: to.y }, { duration: 0.12, ease: 'inQuad' });
      await ctx.tween.delay(0.2);
    }
  }

  _setHands(minutesPast) {
    const ud = this.clock.userData;
    const m = 41 + minutesPast, h = 11 + Math.floor(m / 60);
    ud.minuteHand.rotation.z = -((m % 60) / 60) * TAU;
    ud.hourHand.rotation.z = -(((h % 12) + (m % 60) / 60) / 12) * TAU;
  }
  onClockTick(n) {
    const { ctx } = this;
    const ud = this.clock.userData;
    ctx.audio.play('clockTick', { gain: 0.9, pitch: 0.7 });
    ctx.tween.to(ud.minuteHand.rotation, { z: -((41 + n) % 60 / 60) * TAU }, { duration: 0.5, ease: 'outBack' });
    this._setHourHand(n);
    this._pendulum = true;
  }
  _setHourHand(n) { const m = 41 + n, h = 11 + Math.floor(m / 60); this.clock.userData.hourHand.rotation.z = -(((h % 12) + (m % 60) / 60) / 12) * TAU; }

  // ───────────────────────────────────────────────── the baize door, north-west, and the stair down behind it
  _buildBaize() {
    const G = this.group, { ctx } = this;
    const grp = new THREE.Group(); grp.name = 'baize'; grp.position.set(-W / 2, 0, BAIZE.z); grp.rotation.y = Math.PI / 2; G.add(grp);
    const wood = M.walnut({ tint: '#2e1e16' });
    const jamb = (x) => { const m = F.rbox(0.09, BAIZE.h + 0.1, 0.16, wood, 0.008); m.position.set(x, (BAIZE.h + 0.1) / 2, 0); grp.add(m); };
    jamb(-BAIZE.w / 2 - 0.045); jamb(BAIZE.w / 2 + 0.045);
    const head = F.rbox(BAIZE.w + 0.18, 0.1, 0.16, wood, 0.008); head.position.set(0, BAIZE.h + 0.05, 0); grp.add(head);
    // the passage beyond: dark stone, a flight going down, a warmth at the bottom
    const stone = new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 1, side: THREE.BackSide });
    const passage = new THREE.Mesh(new THREE.BoxGeometry(BAIZE.w, BAIZE.h + 1.4, 2.4), stone); passage.position.set(0, (BAIZE.h - 1.4) / 2, -1.2); grp.add(passage);
    const step = M.smoothStone({ color: '#4a423c' });
    for (let i = 0; i < 7; i++) { const t = F.rbox(BAIZE.w - 0.04, 0.05, 0.3, step, 0.006); t.position.set(0, -i * 0.19 - 0.025, -0.25 - i * 0.3); grp.add(t); }
    const glow = new THREE.PointLight('#ff6a2a', 0, 4, 2); glow.position.set(0, -0.6, -2.0); grp.add(glow);
    // the leaf: green baize over boards, brass studs in a diamond
    const pivot = new THREE.Group(); pivot.position.set(-BAIZE.w / 2, 0, 0); grp.add(pivot);
    const leaf = new THREE.Group(); leaf.position.set(BAIZE.w / 2, 0, 0); pivot.add(leaf);
    const baize = new THREE.MeshStandardMaterial({ color: '#2d5a3b', roughness: 1 });
    const board = F.rbox(BAIZE.w - 0.02, BAIZE.h - 0.02, 0.05, baize, 0.008); board.position.set(0, BAIZE.h / 2, 0); leaf.add(board);
    const studGeo = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      const x = -0.3 + c * 0.2 + (r % 2 ? 0.1 : 0), y = 0.25 + r * 0.3;
      if (Math.abs(x) > BAIZE.w / 2 - 0.08) continue;
      const g = new THREE.SphereGeometry(0.009, 8, 6); g.translate(x, y, 0.026); studGeo.push(g);
    }
    const studs = new THREE.Mesh(mergeGeos(studGeo), M.brass()); leaf.add(studs);
    const fingerPlate = F.rbox(0.07, 0.24, 0.004, M.brass(), 0.002); fingerPlate.position.set(BAIZE.w / 2 - 0.1, 1.0, 0.028); leaf.add(fingerPlate);
    const edge = F.rbox(BAIZE.w, BAIZE.h, 0.01, M.matte('#1a3a26'), 0.002); edge.position.set(0, BAIZE.h / 2, -0.03); leaf.add(edge);
    // the hook beside it, empty
    const hook = new THREE.Group(); hook.position.set(BAIZE.w / 2 + 0.2, 1.55, 0.0); grp.add(hook);
    const hookPlate = F.rbox(0.03, 0.06, 0.006, M.brass(), 0.002); hook.add(hookPlate);
    const hookArm = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 14, Math.PI * 1.1), M.brass()); hookArm.position.set(0, -0.02, 0.025); hookArm.rotation.y = Math.PI / 2; hookArm.rotation.z = -0.5; hook.add(hookArm);
    const hookProxy = ctx.hotspots.proxyBox(0.12, 0.14, 0.1); hookProxy.position.set(0, -0.01, 0.03); hook.add(hookProxy);
    // the open door's spill: a warm fan on the tiles in front of the doorway and a light just inside the hall, so the
    // open door reads from the front door even where the clock and the stair foot hide the doorway itself
    const sc = makeCanvas(256, 256), sg = sc.getContext('2d');
    const sgr = sg.createRadialGradient(128, 0, 4, 128, 0, 250);
    sgr.addColorStop(0, 'rgba(255,170,90,0.95)'); sgr.addColorStop(0.35, 'rgba(255,130,60,0.45)'); sgr.addColorStop(1, 'rgba(255,110,40,0)');
    sg.fillStyle = sgr; sg.beginPath(); sg.moveTo(128 - 60, 0); sg.lineTo(128 + 60, 0); sg.lineTo(256, 256); sg.lineTo(0, 256); sg.closePath(); sg.fill();
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshBasicMaterial({ map: canvasTexture(sc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    // in the group's frame +z is into the hall: the fan's narrow end sits on the threshold
    // fanned a little south (local -x), out from under the stair's foot
    spill.rotation.x = -Math.PI / 2; spill.rotation.z = -0.25; spill.position.set(-0.35, 0.009, 1.1);
    spill.renderOrder = 1; spill.userData.noRaycast = true; grp.add(spill);
    const spillLight = new THREE.PointLight('#ff9a50', 0, 4.2, 1.6); spillLight.position.set(0, 1.1, 0.35); grp.add(spillLight);
    this.baize = { group: grp, pivot, leaf, glow, spill, spillLight };
    this._hs({
      id: 'foyer.baize', object: leaf, label: () => (this.house.called ? 'The cellar stair' : 'Baize door'), enabled: () => this._inHall(),
      onClick: () => (this.house.called ? this._go('cellar') : ctx.dialogue.say('react.baize')),
      useItem: { '*': () => (this.house.called ? ctx.dialogue.caption('caption.nope') : ctx.dialogue.say('react.baize')) },
    });
    // From the hall the foot of the stair (newel, panelled face, rail) stands in front of the baize door's right half, so
    // clicks there went to "Up the stair". The hall camera never moves, so a pane cut from its view of the doorway,
    // set just in front of the stair foot, gives the door its whole outline back.
    {
      const V = new THREE.Vector3(...Foyer.vantage.position), k = 0.86;
      const corner = (z, y) => new THREE.Vector3(-W / 2, y, z).sub(V).multiplyScalar(k).add(V);
      const z0 = BAIZE.z - BAIZE.w / 2, z1 = BAIZE.z + BAIZE.w / 2;
      const pts = [corner(z0, 0), corner(z1, 0), corner(z1, BAIZE.h), corner(z0, BAIZE.h)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
      const pane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })); pane.userData.hitProxy = true; G.add(pane);
      this._hs({
        id: 'foyer.baize.front', object: pane, label: () => (this.house.called ? 'The cellar stair' : 'Baize door'), highlight: leaf, enabled: () => this._inHall(),
        onClick: () => (this.house.called ? this._go('cellar') : ctx.dialogue.say('react.baize')),
        useItem: { '*': () => (this.house.called ? ctx.dialogue.caption('caption.nope') : ctx.dialogue.say('react.baize')) },
      });
    }
    const passProxy = ctx.hotspots.proxyBox(BAIZE.w - 0.1, BAIZE.h - 0.1, 0.4); passProxy.position.set(0, BAIZE.h / 2, -0.25); grp.add(passProxy);
    this._hs({ id: 'foyer.baize.stair', object: passProxy, label: 'Down to the cellar', highlight: false, enabled: () => this.house.called && this._inHall(), onClick: () => this._go('cellar') });
    this._hs({ id: 'foyer.hook', object: hookProxy, label: 'An empty hook', highlight: hookArm, enabled: () => this.house.called && this._inHall(), onClick: () => ctx.dialogue.caption('caption.hook', { duration: 5 }) });
  }
  async _openBaize(animated) {
    const { ctx } = this;
    const b = this.baize;
    if (!animated) { b.pivot.rotation.y = 1.5; b.glow.intensity = 2.6; b.spill.material.opacity = 0.75; b.spillLight.intensity = 3.2; return; }
    if (b.pivot.rotation.y > 1) return;
    ctx.audio.play('doorOpen', { gain: 0.6, pitch: 0.7 });
    ctx.tween.to(b.glow, { intensity: 2.6 }, { duration: 1.8 });
    ctx.tween.to(b.spill.material, { opacity: 0.75 }, { duration: 2.0 });
    ctx.tween.to(b.spillLight, { intensity: 3.2 }, { duration: 2.0 });
    await ctx.tween.to(b.pivot.rotation, { y: 1.5 }, { duration: 1.6, ease: 'outCubic' });
    ctx.dialogue.caption('caption.baize.open', { duration: 6 });
  }

  // ───────────────────────────────────────────────── east: conservatory doors with the moon-dial lock, the painting
  _buildEast() {
    const G = this.group, { ctx } = this;
    const doors = new THREE.Group(); doors.name = 'conservatoryDoors'; doors.position.set(W / 2 - 0.03, 0, CONS.z); doors.rotation.y = -Math.PI / 2; G.add(doors);
    const dw = CONS.dw, dh = CONS.dh, wood = M.walnut({ tint: '#2e1e16' });
    // frame
    const fr = (w, h, x, y) => { const m = F.rbox(w, h, 0.12, wood, 0.008); m.position.set(x, y, 0); doors.add(m); };
    fr(0.1, dh + 0.1, -dw - 0.05, (dh + 0.1) / 2); fr(0.1, dh + 0.1, dw + 0.05, (dh + 0.1) / 2); fr(dw * 2 + 0.2, 0.12, 0, dh + 0.06);
    // what lies beyond: a short vestibule (the leaves swing into it), then the glass room under the moon, cold
    const vest = new THREE.Mesh(new THREE.BoxGeometry(dw * 2 + 0.12, dh, 1.8), new THREE.MeshStandardMaterial({ color: '#1e2a2c', roughness: 1, side: THREE.BackSide }));
    vest.position.set(0, dh / 2, -0.03 - 0.9); vest.userData.noHighlight = true; doors.add(vest);
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(dw * 2 + 0.12, dh), new THREE.MeshStandardMaterial({ color: '#0a1a1c', emissive: '#4a6a8a', emissiveIntensity: 0.55, roughness: 1 }));
    beyond.position.set(0, dh / 2, -1.8); beyond.userData.noHighlight = true; doors.add(beyond);
    const beyondLight = new THREE.PointLight('#9fb6ff', 0, 3.2, 2); beyondLight.position.set(0, 1.6, -1.1); doors.add(beyondLight);
    const leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * dw, 0, 0.0); doors.add(pivot);
      const leaf = new THREE.Group(); leaf.position.set(-s * dw / 2, 0, 0); pivot.add(leaf);
      const stile = (x) => { const m = F.rbox(0.08, dh, 0.05, wood, 0.006); m.position.set(x, dh / 2, 0); leaf.add(m); };
      stile(-dw / 2 + 0.04); stile(dw / 2 - 0.04);
      const rail = (y, h) => { const m = F.rbox(dw - 0.1, h, 0.05, wood, 0.006); m.position.set(0, y, 0); leaf.add(m); };
      rail(0.08, 0.16); rail(dh - 0.05, 0.1); rail(0.75, 0.06);
      for (let i = 1; i < 4; i++) { const m = F.rbox(dw - 0.1, 0.03, 0.04, wood, 0.004); m.position.set(0, 0.78 + i * ((dh - 0.1 - 0.78) / 4), 0); leaf.add(m); }
      const mull = F.rbox(0.03, dh - 0.9, 0.04, wood, 0.004); mull.position.set(0, 0.78 + (dh - 0.9) / 2, 0); leaf.add(mull);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.1, dh - 0.9), M.glass({ color: '#9fd8c8', opacity: 0.18, roughness: 0.15 })); glass.position.set(0, 0.78 + (dh - 0.9) / 2, 0); glass.renderOrder = 3; leaf.add(glass);
      const lower = F.rbox(dw - 0.16, 0.56, 0.03, M.walnut({ tint: '#3a2418' }), 0.006); lower.position.set(0, 0.44, 0); leaf.add(lower);
      leaves.push(pivot);
    }
    // the lock: a brass plate on the right leaf at the meeting stile, four moon dials. Each dial turns both ways: its
    // upper half (a small brass arrow above it) brings the next phase, its lower half the previous one, so an overshoot
    // costs one click back, not seven forward.
    const LX = -dw / 2 + 0.19; // on the right leaf, by the meeting stile
    const DIAL = 0.072, PITCH = 0.082;
    const plate = F.rbox(0.36, 0.15, 0.025, M.brass(), 0.004); plate.position.set(LX, 1.05, 0.035); leaves[1].children[0].add(plate);
    const lockGroup = new THREE.Group(); lockGroup.position.set(LX, 1.05, 0.05); leaves[1].children[0].add(lockGroup);
    const vals = ctx.state.get('foyer.moons.dials', [5, 3, 7, 0]); // mixed phases, so they read as moons at a glance
    const arrowMat = M.brass({ polished: true });
    const dials = vals.map((v, i) => {
      const dial = makeCanvasPlane(DIAL, DIAL, (g, w, h) => this._drawDial(g, w, h, v), { px: 256, emissive: true, transparent: true });
      dial.material.color.setScalar(0.7); // under the bloom threshold, so the terminator stays a hard edge
      dial.position.set(-PITCH * 1.5 + i * PITCH, 0, 0.001); dial.userData.value = v; lockGroup.add(dial);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(DIAL / 2 + 0.001, 0.0035, 8, 32), M.brass({ polished: true })); rim.position.copy(dial.position); rim.position.z = 0.003; lockGroup.add(rim);
      // the two halves, signposted: a small arrow above (on) and below (back)
      for (const sgn of [1, -1]) {
        const tri = new THREE.Shape(); tri.moveTo(-0.007, 0); tri.lineTo(0.007, 0); tri.lineTo(0, sgn * 0.008); tri.closePath();
        const arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri), arrowMat); arrow.position.set(dial.position.x, sgn * (DIAL / 2 + 0.008), 0.001); arrow.userData.noRaycast = true; lockGroup.add(arrow);
      }
      return dial;
    });
    this.moonDials = dials;
    const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), M.matte('#060402')); keyhole.position.set(0.0, -0.04, 0.002); keyhole.visible = false; lockGroup.add(keyhole);
    const onOpen = async () => {
      // from the dial close-up, pull back to frame both doors first, so the swing (and the lines after it) has something to look at
      if (ctx.camera.scope === 'focus:foyer.moons') {
        const p = doors.localToWorld(new THREE.Vector3(-0.45, 1.45, 2.45)), l = doors.localToWorld(new THREE.Vector3(0, 1.1, -0.2)); // from her left, so she is not in the way
        await ctx.camera.refocus({ position: [p.x, p.y, p.z], lookAt: [l.x, l.y, l.z], fov: 55, duration: 0.8 });
      }
      ctx.audio.play('unlock', { gain: 0.8 });
      await ctx.tween.delay(0.3);
      ctx.audio.play('doorOpen', { gain: 0.7, pitch: 0.9 });
      ctx.tween.to(beyondLight, { intensity: 1.4 }, { duration: 1.4 });
      await Promise.all(leaves.map((p, i) => ctx.tween.to(p.rotation, { y: (i === 0 ? 1 : -1) * 1.35 }, { duration: 1.3, ease: 'outCubic' })));
    };
    const force = () => this.house.open('moons', 'force', { onOpen, keep: true });
    const focus = () => {
      if (!this.house.isOpen('moons') && !this.house.canOpen('moons')) return this.house.focusLock('moons');
      const p = doors.localToWorld(new THREE.Vector3(0.12, 1.08, 0.62));
      const l = doors.localToWorld(new THREE.Vector3(0.14, 1.04, 0.05));
      return ctx.camera.focus({ position: [p.x, p.y, p.z], lookAt: [l.x, l.y, l.z], scope: 'focus:foyer.moons', fov: 42, onExit: () => this.house.blurLock() })
        .then(() => this.house.focusLock('moons', { onOpen, keep: true }));
    };
    this._hs({
      id: 'foyer.moons', object: doors, label: () => (this.house.isOpen('moons') ? 'The conservatory' : 'Conservatory doors'), scope: ['room', 'focus:foyer.moons'],
      enabled: () => this._inHall() && (ctx.camera.scope === 'room' || this.house.isOpen('moons')),
      onClick: () => (this.house.isOpen('moons') ? ctx.game.goToRoom('conservatory') : focus()),
      useItem: { bonekey: () => { if (!this.house.isOpen('moons')) force(); } },
    });
    // each dial has two halves, like the parlour drums: the upper turns it on to the next phase, the lower back
    const turnDial = (dial, i, dir) => {
      dial.userData.value = (dial.userData.value + dir + 8) % 8;
      this._lastDial = i;
      ctx.audio.play('ratchet', { gain: 0.5, pitch: (dir > 0 ? 1.15 : 1.0) + i * 0.05 });
      dial.userData.redraw((g, w, h) => this._drawDial(g, w, h, dial.userData.value));
      ctx.state.set('foyer.moons.dials', dials.map((d) => d.userData.value));
      if (dials.every((d, j) => d.userData.value === MOON_SOLUTION[j])) this.house.open('moons', 'pick', { onOpen, keep: true });
    };
    dials.forEach((dial, i) => {
      for (const [dir, half] of [[1, 'on'], [-1, 'back']]) {
        const proxy = ctx.hotspots.proxyBox(PITCH - 0.004, DIAL / 2 + 0.014, 0.02); proxy.position.set(dial.position.x, dir * (DIAL / 2 + 0.014) / 2, 0.004); lockGroup.add(proxy);
        this._hs({
          id: `foyer.moons.dial${i}.${half}`, object: proxy, label: `Moon dial, turn ${half}`, scope: 'focus:foyer.moons', highlight: dial,
          enabled: () => !this.house.isOpen('moons'),
          onClick: () => turnDial(dial, i, dir),
          useItem: { bonekey: force },
        });
      }
    });
    this.doors = { group: doors, leaves, beyondLight };

    // the painting: the house under a sky; by lantern light, four moons
    const paint = F.pictureFrame({ w: 1.0, h: 0.7, border: 0.07, style: 'gilt', px: 1024, draw: (g, w, h) => this._paintHouse(g, w, h) });
    paint.position.set(W / 2 - 0.06, 2.05, 1.15); paint.rotation.y = -Math.PI / 2; G.add(paint);
    const moons = makeCanvasPlane(0.86, 0.56, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = w * 0.028;
      MOON_SOLUTION.forEach((p, i) => drawMoon(g, w * (0.2 + i * 0.2), h * 0.22, r, p, { dark: '#2a2638', light: '#f3e9c8' }));
    }, { px: 512, emissive: true, transparent: true });
    moons.material.opacity = 0; moons.material.depthWrite = false; moons.userData.noRaycast = true;
    moons.position.set(W / 2 - 0.06 - 0.03, 2.05, 1.15); moons.rotation.y = -Math.PI / 2; G.add(moons);
    this.painting = { frame: paint, moons };
    const pos = [W / 2 - 1.05, 2.0, 1.15], look = [W / 2, 2.0, 1.15];
    this._hs({
      id: 'foyer.painting', object: paint, label: 'Painting', enabled: () => this._inHall(),
      onClick: async () => {
        await ctx.camera.focus({ position: pos, lookAt: look, scope: 'focus:foyer.painting', fov: 40, onExit: () => ctx.dialogue.hideCaption() });
        ctx.dialogue.caption(this.house.lantern === 'carried' ? 'caption.painting.lit' : 'caption.painting.dark', { duration: 6 });
      },
    });
  }

  /** One moon dial: a dark face, a ring of eight phase ticks (the current one lit), and a large, hard-edged moon whose
   *  crescents and gibbous phases are exaggerated so all eight read apart at arm's length. */
  _drawDial(g, w, h, phase) {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#0b0912'; g.beginPath(); g.arc(cx, cy, w / 2 - 1, 0, TAU); g.fill();
    // the tick ring: eight notches, new moon at the top, running clockwise; the current phase is a bright bead
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + (k / 8) * TAU, rr = w * 0.43;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      g.fillStyle = k === phase ? '#ffe7a8' : 'rgba(220,200,150,0.55)';
      g.beginPath(); g.arc(x, y, k === phase ? w * 0.034 : w * 0.017, 0, TAU); g.fill();
    }
    drawDialMoon(g, cx, cy, w * 0.33, phase);
  }

  _paintHouse(g, w, h) {
    const r = rng(41);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2a2638'); sky.addColorStop(0.55, '#4a3c3a'); sky.addColorStop(1, '#6a4a32');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // the house: a dark gable with one lit window
    g.fillStyle = '#1c1612';
    g.beginPath(); g.moveTo(w * 0.3, h * 0.78); g.lineTo(w * 0.3, h * 0.45); g.lineTo(w * 0.5, h * 0.28); g.lineTo(w * 0.7, h * 0.45); g.lineTo(w * 0.7, h * 0.78); g.closePath(); g.fill();
    g.fillRect(w * 0.22, h * 0.55, w * 0.1, h * 0.23); g.fillRect(w * 0.68, h * 0.55, w * 0.12, h * 0.23);
    g.fillStyle = '#d8a050'; g.fillRect(w * 0.47, h * 0.5, w * 0.06, h * 0.08);
    // ground and a path
    g.fillStyle = '#3a2e22'; g.fillRect(0, h * 0.78, w, h * 0.22);
    g.strokeStyle = '#6a5438'; g.lineWidth = w * 0.01; g.beginPath(); g.moveTo(w * 0.5, h * 0.78); g.quadraticCurveTo(w * 0.45, h * 0.9, w * 0.55, h); g.stroke();
    // a little signature
    g.fillStyle = 'rgba(220,200,160,0.5)'; g.font = `italic ${Math.round(h * 0.05)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'right'; g.fillText('Vesper Lane, 1931', w * 0.96, h * 0.96);
    // varnish: a tea-coloured haze with craquelure
    g.fillStyle = 'rgba(120,80,30,0.35)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 160; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * w * 0.08, y + (r() - 0.5) * h * 0.08); g.stroke(); }
  }

  _syncPainting(animated) {
    const lit = this.house.lantern === 'carried';
    const m = this.painting.moons.material;
    if (animated) this.ctx.tween.to(m, { opacity: lit ? 0.95 : 0 }, { duration: 1.5 });
    else m.opacity = lit ? 0.95 : 0;
  }

  // ───────────────────────────────────────────────── the hall table: bell, ledger, lamp, honesty
  _buildTable() {
    const G = this.group, { ctx } = this;
    const table = F.table({ w: 1.3, d: 0.42, h: 0.84, material: M.walnut({ tint: '#2e1e16' }), legs: 'turned' });
    table.position.set(W / 2 - 0.25, 0, 1.15); table.rotation.y = -Math.PI / 2; G.add(table);
    const top = table.userData.topY ?? 0.84;
    // the service bell: a brass dome with a button
    const bell = new THREE.Group(); bell.position.set(0.3, top, 0.0); table.add(bell);
    const dome = F.lathe([[0.0, 0.0], [0.055, 0.0], [0.058, 0.01], [0.05, 0.03], [0.035, 0.05], [0.012, 0.062], [0, 0.064]], M.brass({ polished: true }), 24); bell.add(dome);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 12), M.iron({ color: '#3a3632' })); btn.position.y = 0.068; bell.add(btn);
    const bellProxy = ctx.hotspots.proxyBox(0.14, 0.1, 0.14); bellProxy.position.set(0, 0.05, 0); bell.add(bellProxy);
    this._hs({
      id: 'foyer.bell', object: bell, label: 'Service bell',
      onClick: async () => {
        ctx.audio.play('chime', { gain: 0.7, pitch: 1.6 });
        ctx.tween.to(btn.position, { y: 0.06 }, { duration: 0.06 }).then(() => ctx.tween.to(btn.position, { y: 0.068 }, { duration: 0.2, ease: 'outBack' }));
        this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 6);
        if (this.house.called) { ctx.hints.ask(); return; }
        if (!ctx.state.get('foyer.bell.said')) { ctx.state.set('foyer.bell.said', true); await ctx.dialogue.say('react.bell.idle'); }
        // "The cellar" ends the wings: ask twice. The shared choice's own reply (her "Noted.") waits for the confirmation.
        const bell = ctx.script['choice.bell'];
        const idx = await ctx.dialogue.choice({ ...bell, options: [bell.options[0], { ...bell.options[1], reply: [] }] });
        if (idx === 1) { if ((await ctx.dialogue.choice('choice.bell.cellar')) === 0) await this.house.callEarly(); }
        else if (idx === 0) ctx.hints.ask();
      },
    });
    // the ledger: a closed book with a brass clasp
    const ledger = new THREE.Group(); ledger.position.set(-0.25, top, 0.02); ledger.rotation.y = 0.12; table.add(ledger);
    const cover = F.rbox(0.3, 0.05, 0.4, new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.6 }), 0.006); cover.position.y = 0.025; ledger.add(cover);
    const pages = F.rbox(0.28, 0.04, 0.38, M.parchment({ tint: '#d9c9a0' }), 0.003); pages.position.set(0.012, 0.025, 0); ledger.add(pages);
    const clasp = F.rbox(0.03, 0.06, 0.05, M.brass(), 0.003); clasp.position.set(0.15, 0.03, 0.06); ledger.add(clasp);
    this._hs({ id: 'foyer.ledger', object: ledger, label: 'The ledger', onClick: () => ctx.papers.show(this.house.ledgerPaper()) });
    // the lamp
    const lamp = F.candle({ h: 0.09, r: 0.02, holder: 'dish', light: true, intensity: 2.6, distance: 6, lit: true, color: '#ffa860', castShadow: false });
    lamp.position.set(0.0, top, 0.08); table.add(lamp);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 14, 1, true), M.glass({ color: '#ffe0b0', opacity: 0.16 })); chimney.position.set(0, top + 0.14, 0.08); chimney.renderOrder = 2; table.add(chimney);
    this.lamp = lamp;
    // the vase of honesty
    const vase = new THREE.Group(); vase.position.set(-0.52, top, -0.02); table.add(vase);
    const v = F.lathe([[0, 0], [0.05, 0], [0.06, 0.04], [0.035, 0.14], [0.04, 0.2], [0.05, 0.24], [0, 0.24]], new THREE.MeshStandardMaterial({ color: '#4a5a4e', roughness: 0.3, metalness: 0.1 }), 20); vase.add(v);
    const podMat = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.6, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.42, 5), M.matte('#5a4a30')); stem.position.set((i - 3) * 0.012, 0.4, (i % 2) * 0.02 - 0.01); stem.rotation.z = (i - 3) * 0.12; stem.rotation.x = (i % 3 - 1) * 0.1; vase.add(stem);
      for (let j = 0; j < 4; j++) { const pod = new THREE.Mesh(new THREE.CircleGeometry(0.016, 10), podMat); pod.position.set((i - 3) * 0.012 + (i - 3) * 0.12 * (0.2 + j * 0.06), 0.42 + j * 0.06, (i % 2) * 0.02 - 0.01); pod.rotation.y = (i + j) * 0.7; vase.add(pod); }
    }
    this._hs({ id: 'foyer.honesty', object: vase, label: 'Dried honesty', onClick: () => ctx.dialogue.caption('caption.honesty') });
    this.table = table;
  }

  // ───────────────────────────────────────────────── dressing
  _buildDressing() {
    const G = this.group;
    // the runner stops short of the door, so the moon has bare tiles to write on
    const runner = F.rug({ w: 1.1, d: 2.6, base: '#4a1a1c', accent: '#8a6a3a', dark: '#1e0e0c' }); runner.position.set(0.1, 0.004, -1.1); G.add(runner);
    for (const [x, z, ry] of [[-W / 2 + 0.02, -D / 2 + 0.02, 0], [W / 2 - 0.02, -D / 2 + 0.02, -Math.PI / 2], [-W / 2 + 0.02, D / 2 - 0.02, Math.PI / 2]]) {
      const web = cobweb({ size: 0.7 }); web.position.set(x, H - 0.02, z); web.rotation.y = ry; G.add(web);
    }
    G.add(P.dustMotes({ box: [5, 4, 6], center: [0, 2.1, 0], count: 280, color: '#d8ccb0', size: 0.016, opacity: 0.4 }));
    // a side chair by the parlour door
    const chair = F.armchair({ color: '#3a2a3a', w: 0.6 }); chair.position.set(-W / 2 + 0.45, 0, 2.2); chair.rotation.y = Math.PI / 2 + 0.3; G.add(chair);
  }

  // ───────────────────────────────────────────────── Mrs. Tallow
  _buildTallow() {
    const { ctx } = this;
    const fig = makeFigure({ kind: 'tallow' });
    this.tallow = fig;
    this.tallowHome = { pos: [2.05, 0, -0.35], yaw: -2.2 };
    fig.position.set(...this.tallowHome.pos); fig.rotation.y = this.tallowHome.yaw;
    this.group.add(fig);
    this._hs({
      id: 'foyer.tallow', object: fig, label: 'Mrs. Tallow',
      onClick: () => ctx.hints.ask(),
      useItem: { lantern: () => { ctx.dialogue.say([{ who: 'tallow', text: 'It was left for you, not for me. Keep it.' }]); return false; }, '*': () => ctx.dialogue.caption('caption.nope') },
    });
  }
  /** Glide a figure to a point, its feet following the stair where there is one. */
  async _stride(fig, to, { speed = 0.9, faceYaw = null, onStair = false } = {}) {
    const { ctx } = this;
    const from = fig.position.clone(), target = new THREE.Vector3(...to);
    const dx = target.x - from.x, dz = target.z - from.z, dist = Math.hypot(dx, dz, onStair ? target.y - from.y : 0);
    const turnTo = async (y, dur) => { let y0 = fig.rotation.y; while (y - y0 > Math.PI) y -= TAU; while (y - y0 < -Math.PI) y += TAU; await ctx.tween.to(fig.rotation, { y }, { duration: dur, ease: 'inOutSine' }); };
    if (dist > 0.02) {
      if (Math.hypot(dx, dz) > 0.05) await turnTo(Math.atan2(dx, dz), 0.4);
      const dur = dist / speed; let last = 0;
      await ctx.tween.run(dur, (k) => {
        fig.position.lerpVectors(from, target, k);
        const phase = k * dur * 2.4;
        const bob = Math.abs(Math.sin(phase * Math.PI)) * 0.012;
        fig.position.y = (onStair ? stairY(fig.position.x, STAIR) : from.y + (target.y - from.y) * k) + bob;
        const step = Math.floor(phase);
        if (step !== last) { last = step; ctx.audio.play('footstep', { gain: 0.35, pitch: onStair ? 1.0 : 0.9 }); }
      }, { ease: 'inOutSine' });
      fig.position.copy(target);
    }
    if (faceYaw != null) await turnTo(faceYaw, 0.5);
  }
  /** House.open('ring') calls this: walk her to the lock, then she looks at it. The landing she climbs, slowly, after a word. */
  async tallowTo(lockId) {
    const { ctx } = this;
    // cup: east of the cupboard and back from it, outside the close-up's frame (its camera stands at x 0, z -1.25)
    // and off the hall's line to the little door
    const spots = { cup: { pos: [0.95, 0, -1.8], yaw: -1.97 }, moons: { pos: [2.25, 0, -0.45], yaw: -Math.PI / 2 }, parlour: { pos: [-2.45, 0, 0.75], yaw: -Math.PI / 2 } };
    if (lockId === 'landing') {
      const S = STAIR;
      if (this.tallow.position.y < LAND.y - 0.1) {
        await this._stride(this.tallow, [S.x0 + 0.02, 0, S.z0 + S.w / 2], { speed: 1.1, faceYaw: Math.PI / 2 });
        await this._stride(this.tallow, [S.x0 + 2.5 * S.run, 0.6, S.z0 + S.w / 2], { speed: 0.6, onStair: true });
        this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 6);
        this._tallowClimb = true; // House says "You rang." now; the nursery door's onOpen('ring') finishes the climb
        return;
      }
      await this._stride(this.tallow, [TALLOW_STAIRTOP.x, stairY(TALLOW_STAIRTOP.x, STAIR), TALLOW_STAIRTOP.z], { speed: 0.5, onStair: true, faceYaw: TALLOW_STAIRTOP.yaw });
      return;
    }
    this._tallowClimb = false;
    const s = spots[lockId]; if (!s) return;
    if (this.tallow.position.y > 0.1) this.tallow.position.set(...this.tallowHome.pos);
    await this.tallow.userData.walkTo(ctx, s.pos, { faceYaw: s.yaw });
  }
  /** The rest of her ring on the landing, after "You rang.": the stairs line as she climbs, then the door. */
  async _finishClimb() {
    if (!this._tallowClimb) return;
    this._tallowClimb = false;
    const { ctx } = this, S = STAIR;
    const climb = (async () => {
      await ctx.tween.delay(0.3);
      // she stops four treads short of the landing, behind you: the house does the rest
      await this._stride(this.tallow, [TALLOW_STAIRTOP.x, stairY(TALLOW_STAIRTOP.x, S), TALLOW_STAIRTOP.z], { speed: 0.45, onStair: true, faceYaw: TALLOW_STAIRTOP.yaw });
      this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 6);
    })();
    await ctx.dialogue.say('react.tallow.stairs');
    await climb;
  }
  onHintAsked() {
    const cam = this.ctx.camera.camera.position.clone();
    this.tallow.userData.lookAt(cam, 5);
  }
  /** The call: she is simply beside you, in the hall or up on the landing. */
  _placeTallowBeside() {
    const { ctx } = this;
    const fig = this.tallow;
    if (this._onLanding) { fig.position.set(TALLOW_STAIRTOP.x, stairY(TALLOW_STAIRTOP.x, STAIR), TALLOW_STAIRTOP.z); fig.rotation.y = TALLOW_STAIRTOP.yaw; }
    else { fig.position.set(1.1, 0, 2.7); fig.rotation.y = -1.9; } // at the player's elbow, east, out of the line to the stair and the doors
    fig.userData.lookAt(ctx.camera.camera.position.clone(), 10);
  }
  /** The call: she is beside you before she speaks (the `house.on` listener above may have placed her already). */
  onCall() {
    if (this._calledPlaced) return;
    this._calledPlaced = true;
    this._placeTallowBeside();
  }
  /** After her line: the baize door opens on the stair. */
  async afterCall() { await this._openBaize(true); }

  // ───────────────────────────────────────────────── restore / lifecycle
  _restore() {
    const h = this.house;
    const s = h.s;
    this.cup.glint.visible = !h.isOpen('cup');
    if (h.isOpen('cup')) { this.cup.nail.visible = false; this.cup.leaf.rotation.y = -1.9; this.cup.light.intensity = h.lantern === 'none' ? 1.6 : 0; }
    if (h.lantern !== 'none') this.cup.lantern.visible = false;
    if (h.isOpen('moons')) { this.doors.leaves[0].rotation.y = 1.35; this.doors.leaves[1].rotation.y = -1.35; this.doors.beyondLight.intensity = 1.4; }
    if (h.isOpen('parlour')) {
      const p = this.parlour;
      p.leaf.rotation.y = 1.55; p.beyondLight.intensity = 1.2; p.beyond.material.emissiveIntensity = 0.5;
      if (h.verb('parlour') === 'force') { p.keyhole.visible = true; this._dropRings(true); }
      else p.rings.forEach((r, i) => { r.userData.value = r.userData.turn = ROOK[i]; r.rotation.y = ringAngle(ROOK[i]); });
    }
    if (h.isOpen('landing')) {
      const n = this.nursery;
      n.leaf.rotation.y = 1.5; n.bolt.position.x = 0.69; n.beyondLight.intensity = 1.6; n.beyond.material.emissiveIntensity = 0.6;
      if (h.verb('landing') === 'force') { n.keyhole.visible = true; this.sampler.position.y -= 0.006; this.sampler.rotation.z = -0.035; }
      else for (const p of n.pegs) { p.peg.position.y = p.y0 + p.up; p.cap.position.y = p.y0 + p.up; }
    }
    if (this.ropeDown) this.rope.swing.rotation.x = 1.15;
    if (h.called) this._openBaize(false);
    this._setHands(s.clock);
    this._pendulum = s.clock > 0;
    this._syncPainting(false);
  }

  enter({ from } = {}) {
    const { ctx } = this;
    this._carried.set(this.house.lantern === 'carried');
    ctx.audio.setClockRunning?.(this.house.s.clock > 0 && !this.house.called);
    this._syncPainting(false);
    // back from the nursery (or a reload up there): the landing; otherwise the hall
    const up = from === 'nursery' || (from == null && !!ctx.state.get('foyer.landing') && this.ropeDown);
    this._setLanding(up);
    // Mrs. Tallow is at her table unless the house has called, in which case she is beside you
    if (this.house.called) { this._calledPlaced = true; this._placeTallowBeside(); }
    else { this.tallow.position.set(...this.tallowHome.pos); this.tallow.rotation.y = this.tallowHome.yaw; }
    if (!ctx.state.get('foyer.intro.seen')) {
      ctx.state.set('foyer.intro.seen', true);
      this._timers.push(setTimeout(async () => {
        if (ctx.game.currentRoom !== this) return;
        this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 8);
        await ctx.dialogue.say('foyer.intro');
      }, 1400));
    } else if (from) {
      this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 4);
    }
  }
  enterTitle() { this._carried.set(false); }
  exit() { for (const t of this._timers) clearTimeout(t); this._timers = []; this._carried.set(false); this._dropPegs?.(true); }

  /** HUD Back / Esc with no close-up open (Game asks the room first): on the landing, walk down. */
  onBack() {
    if (!this._onLanding || this._walking) return false;
    this._goDown();
    return true;
  }

  update(dt, t) {
    const ud = this.clock.userData;
    ud.pendulum.rotation.z = this._pendulum && !this.house.called ? Math.sin(t * Math.PI) * 0.07 : 0;
    if (this.cup.glint.visible) { const k = 0.75 + 0.18 * Math.sin(t * 2.3) + 0.07 * Math.sin(t * 7.1); for (const m of this.cup.glintMats) m.opacity = k; }
    this._carried.update(dt, t);
  }
}

// ───────────────────────────────────────────────── canvas drawings
function mergeGeos(list) {
  // tiny merge for identical-attribute geometries (studs); avoids importing BufferGeometryUtils here
  let total = 0; for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), idx = [];
  let off = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uv.set(g.attributes.uv.array, off * 2);
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.array[i] + off);
    off += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** The dial's moon, hard-edged. Phases 0..7: new, waxing crescent, first quarter, waxing gibbous, full, waning gibbous,
 *  last quarter, waning crescent. The crescent and gibbous terminators are pushed toward the limb so a crescent is a thin
 *  sliver and a gibbous keeps a clear dark bite: at dial size the true ellipse made gibbous read as full. */
function drawDialMoon(g, cx, cy, r, phase) {
  const light = '#fff1c8', dark = '#1c1828';
  g.save();
  g.fillStyle = dark; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  if (phase === 0) {
    g.strokeStyle = 'rgba(255,241,200,0.55)'; g.lineWidth = Math.max(1, r * 0.08); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    g.restore(); return;
  }
  if (phase === 4) { g.fillStyle = light; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.restore(); return; }
  const waxing = phase < 4;                 // waxing: lit on the right
  const k = waxing ? phase : 8 - phase;     // 1 crescent, 2 quarter, 3 gibbous
  g.fillStyle = light; g.beginPath();
  if (waxing) g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); else g.arc(cx, cy, r, Math.PI / 2, (3 * Math.PI) / 2);
  g.closePath(); g.fill();
  if (k !== 2) {
    const rx = r * 0.62;                    // crescent: a sliver of 0.38 r lit; gibbous: a bite of 0.38 r dark
    g.fillStyle = k === 1 ? dark : light;
    g.beginPath(); g.ellipse(cx, cy, rx, r, 0, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(255,241,200,0.5)'; g.lineWidth = Math.max(1, r * 0.06); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.restore();
}

/** The 26 letters around a brass ring: engraved, dark on brass. u runs round the ring; the glyphs stand along u. */
function ringTexture() {
  // u runs round the drum (26 cells), v along its axis; the canvas is sized so a cell is square on the drum
  const cell = 64, H = Math.round(26 * cell * RING_L / (TAU * RING_R)), c = makeCanvas(26 * cell, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#8a6a2a'); gr.addColorStop(0.5, '#e2bd66'); gr.addColorStop(1, '#8a6a2a');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(60,40,10,0.4)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, H); g.stroke(); }
  g.fillStyle = '#1e1206'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(cell * 0.92)}px "Cormorant Garamond", Georgia, serif`;
  for (let i = 0; i < 26; i++) {
    g.save(); g.translate(i * cell + cell / 2, H / 2); g.rotate(RING_GLYPH_ROT); g.fillText(LETTERS[i], 0, cell * 0.04); g.restore();
  }
  const t = canvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** ROOK leaded into the fanlight, for the street: from inside it runs backwards. Lead lines dark, amber glass inside. */
function drawFanName(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w, 0); g.scale(-1, 1); // mirrored: the street reads it the right way
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.78)}px "Cormorant Garamond", Georgia, serif`;
  g.lineJoin = 'round';
  g.lineWidth = h * 0.085; g.strokeStyle = '#120d0a'; g.strokeText('ROOK', w / 2, h * 0.54);
  g.fillStyle = 'rgba(214,160,70,0.62)'; g.fillText('ROOK', w / 2, h * 0.54);
  g.lineWidth = h * 0.028; g.strokeStyle = 'rgba(250,230,190,0.35)'; g.strokeText('ROOK', w / 2, h * 0.54);
  g.restore();
}

/** The name the moon copies onto the tiles: soft, pale, stretched the way a fanlight's shadow stretches. */
function drawFloorName(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.95)}px "Cormorant Garamond", Georgia, serif`;
  g.save(); g.translate(w / 2, h / 2); g.scale(0.9, 1.0);
  g.shadowColor = 'rgba(190,205,255,0.9)'; g.shadowBlur = h * 0.12;
  g.fillStyle = 'rgba(214,222,255,1)'; g.fillText('ROOK', 0, h * 0.04);
  g.shadowBlur = h * 0.3; g.fillStyle = 'rgba(160,180,255,0.5)'; g.fillText('ROOK', 0, h * 0.04);
  g.restore();
  // the lead lines between the letters, as dark gaps
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.75)';
  for (let i = 1; i < 4; i++) g.fillRect(w * (0.13 + i * 0.187), 0, w * 0.012, h);
  g.globalCompositeOperation = 'source-over';
}

/** The sampler: unbleached linen (kept mid-toned, so the candle and the bloom do not wash it out), a cross-stitch
 *  border, and the rhyme in a child's large, dark capitals: readable at a glance in the close-up. */
function drawSampler(g, w, h) {
  const r = rng(1899);
  g.fillStyle = '#a8977a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3200; i++) { g.fillStyle = `rgba(70,55,35,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 2, 2); }
  // the weave
  g.strokeStyle = 'rgba(80,64,40,0.10)'; g.lineWidth = 1;
  for (let y = 0; y < h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const s = Math.max(6, Math.round(w / 90));
  const x = (px) => { g.beginPath(); g.moveTo(px - s / 2, 0); g.lineTo(px + s / 2, s); g.moveTo(px + s / 2, 0); g.lineTo(px - s / 2, s); g.stroke(); };
  g.strokeStyle = '#6e1e22'; g.lineWidth = Math.max(2, s * 0.3); g.lineCap = 'round';
  const m = s * 2.2;
  for (let px = m; px < w - m + 1; px += s * 1.5) { g.save(); g.translate(0, m - s / 2); x(px); g.restore(); g.save(); g.translate(0, h - m - s / 2); x(px); g.restore(); }
  for (let py = m + s * 1.5; py < h - m - s; py += s * 1.5) { g.save(); g.translate(m, py); x(0); g.restore(); g.save(); g.translate(w - m, py); x(0); g.restore(); }
  // the rhyme: four lines, big, dark indigo thread with a darker edge
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = ['KNOCK AND KNOCK,', 'THEN COUNT A SHEEP;', 'KNOCK ONCE MORE,', 'AND HUSH, AND SLEEP'];
  let size = Math.round(h * 0.135);
  g.font = `800 ${size}px "Cormorant Garamond", Georgia, serif`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > w * 0.84) { size = Math.floor(size * (w * 0.84) / widest); g.font = `800 ${size}px "Cormorant Garamond", Georgia, serif`; }
  lines.forEach((l, i) => {
    const y = h * (0.2 + i * 0.15);
    g.lineJoin = 'round'; g.lineWidth = size * 0.07; g.strokeStyle = '#120a1c'; g.strokeText(l, w / 2, y);
    g.fillStyle = '#2a1846'; g.fillText(l, w / 2, y);
  });
  // a small sheep, and the signature
  g.fillStyle = '#efe6d2'; g.beginPath(); g.ellipse(w * 0.5, h * 0.82, w * 0.045, h * 0.05, 0, 0, TAU); g.fill();
  g.fillStyle = '#2a1e1a'; g.beginPath(); g.ellipse(w * 0.545, h * 0.8, w * 0.014, h * 0.02, 0, 0, TAU); g.fill();
  for (const dx of [-0.02, -0.006, 0.008, 0.022]) g.fillRect(w * (0.5 + dx), h * 0.85, Math.max(3, w * 0.004), h * 0.04);
  g.fillStyle = '#4a1e22'; g.font = `italic 700 ${Math.round(h * 0.075)}px "Cormorant Garamond", Georgia, serif`;
  g.textAlign = 'left'; g.fillText('E.V. aged 7', w * 0.1, h * 0.84);
  g.textAlign = 'right'; g.fillText('1899', w * 0.9, h * 0.84);
}

/** A pen-and-ink plan of the house in a frame: outlines, a few labels, the stair. The paper has the lit version. */
function drawPlanSketch(g, w, h) {
  g.fillStyle = '#d9cfb4'; g.fillRect(0, 0, w, h);
  const r = rng(31);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(90,70,40,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.strokeStyle = '#3a2e22'; g.lineWidth = Math.max(1.5, w * 0.004); g.lineJoin = 'round';
  const s = w / 400;
  const box = (x, y, bw, bh, label) => { g.strokeRect(x * s, y * s + h * 0.05, bw * s, bh * s); if (label) { g.fillStyle = '#4a3a2a'; g.font = `italic ${Math.round(h * 0.05)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'center'; g.fillText(label, (x + bw / 2) * s, (y + bh / 2) * s + h * 0.07); } };
  box(120, 150, 120, 110, 'Hall'); box(120, 100, 120, 50, 'Landing'); box(240, 140, 110, 120, 'Conservatory'); box(10, 140, 110, 120, 'Parlour'); box(120, 20, 120, 80, 'Nursery'); box(10, 280, 230, 60, 'Cellar');
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(128 * s, (150 - i * 8) * s + h * 0.05); g.lineTo(148 * s, (150 - i * 8) * s + h * 0.05); g.stroke(); }
  g.fillStyle = '#4a3a2a'; g.font = `600 ${Math.round(h * 0.055)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'left'; g.fillText('9 Vesper Lane', w * 0.04, h * 0.95);
}
