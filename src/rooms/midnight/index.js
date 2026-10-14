// MIDNIGHT (`midnight`): the hall from the foot of the front door. See docs/GAME.md §7 "Midnight", §8.
//
// A short scene room, one camera: the clock strikes twelve, the yellow key goes in, and the house checks the book
// first, then the key. Three exits by `house.ending()`: `staff` (the handle is cold; the apron on the hook by the baize
// door), `teeth` (the key stops; Mrs. Tallow behind you), or the door opens onto the step and the street: rain, the van
// with its hazards, Mr. Finch by it if he is out, Mr. Wick's hand over yours, Miss Pell's "Noted." to the street. Then
// the card. Nothing here is a hotspot; the player watches.
import * as THREE from 'three';
import { Room } from '../../engine/Room.js';
import * as M from '../../engine/props/materials.js';
import * as F from '../../engine/props/furniture.js';
import * as P from '../../engine/props/particles.js';
import * as L from '../../engine/props/lights.js';
import { makeCanvasPlane } from '../../engine/props/text.js';
import { rng } from '../../engine/props/textures.js';
import { makeFigure } from '../../engine/props/figure.js';
import { mergeStatic, tileTexture, wallpaperTexture } from '../shared.js';

const W = 6, D = 7, H = 4.2;
const DOOR = { x: 0.2, w: 1.2, h: 2.1 };

export default class Midnight extends Room {
  static id = 'midnight';
  static title = 'Midnight';
  static vantage = { position: [0.2, 1.5, 1.45], lookAt: [0.2, 1.2, 3.5], yawLimit: 180, pitchLimit: 28, fov: 56 };
  static puzzleOrder = [];

  async build() {
    this.background = new THREE.Color('#06050a');
    this.fog = new THREE.FogExp2('#0a0810', 0.04);
    this.envIntensity = 0.3;
    this.exposure = 1.1;
    this.bloom = { strength: 0.42, threshold: 0.8, radius: 0.55 };
    this.statics = new THREE.Group(); this.statics.name = 'statics'; this.group.add(this.statics);
    this._buildShell();
    this._buildDoor();
    this._buildBack();
    this._buildPeople();
    this.group.updateMatrixWorld(true);
    mergeStatic(this.statics);
  }
  get house() { return this.ctx.house; }

  // ───────────────────────────────────────────────── the hall, as the foyer has it
  _buildShell() {
    const S = this.statics, G = this.group;
    const wall = new THREE.MeshStandardMaterial({ map: wallpaperTexture({ base: '#4a3a44', motif: '#5e4a56', seed: 3 }), roughness: 0.95 }); wall.map.repeat.set(3, 1.6);
    const floor = new THREE.MeshStandardMaterial({ map: tileTexture({ a: '#15110f', b: '#b7ab96' }), roughness: 0.35, metalness: 0.05 }); floor.map.repeat.set(5, 6);
    const shell = F.roomShell({ w: W, d: D, h: H, floor, wall, ceiling: M.plaster({ tint: '#4a3d3a', repeat: [2, 2] }), beams: 0, wainscot: 1.05, omit: ['south'] });
    S.add(shell);
    // the south wall with the doorway cut out (local x = −world x since it faces north)
    const shape = new THREE.Shape(); shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.closePath();
    const hole = new THREE.Path(); const hx0 = -DOOR.x - DOOR.w / 2, hx1 = -DOOR.x + DOOR.w / 2;
    hole.moveTo(hx0, 0); hole.lineTo(hx1, 0); hole.lineTo(hx1, DOOR.h + 0.75); hole.lineTo(hx0, DOOR.h + 0.75); hole.closePath(); shape.holes.push(hole);
    const south = new THREE.Mesh(new THREE.ShapeGeometry(shape), wall); south.position.set(0, 0, D / 2); south.rotation.y = Math.PI; south.receiveShadow = true; south.userData.keep = true; S.add(south);
    for (const [a, b] of [[-W / 2, DOOR.x - DOOR.w / 2 - 0.1], [DOOR.x + DOOR.w / 2 + 0.1, W / 2]]) { const p = F.rbox(b - a, 1.05, 0.025, M.walnut({ tint: '#4a2f1e' }), 0.004); p.position.set((a + b) / 2, 0.525, D / 2 - 0.012); S.add(p); }
    G.add(L.ambientRig({ sky: '#9fb0ff', ground: '#1a100c', hemi: 0.5, ambient: '#3a3040', ambientIntensity: 0.5 }));
    const moon = L.keyLight({ color: '#9fb6ff', intensity: 12, position: [0.3, 3.9, 3.3], target: [0.2, 0, -1.4], angle: 0.5, penumbra: 0.7, distance: 14, castShadow: true }); G.add(moon);
    const warm = new THREE.PointLight('#ffb070', 2.0, 7, 2); warm.position.set(2.2, 1.6, 1.1); G.add(warm);
    const doorWash = new THREE.PointLight('#9fb6ff', 4.0, 6, 2); doorWash.position.set(0.2, 2.4, 2.3); G.add(doorWash);
    // the hall lamp by the door: the only warm thing in the hall at this hour, and what the key is seen by
    const lamp = new THREE.PointLight('#ffc080', 5.0, 6, 2); lamp.position.set(1.6, 2.0, 2.5); lamp.castShadow = true; lamp.shadow.mapSize.set(512, 512); G.add(lamp);
    const back = new THREE.PointLight('#aab4d8', 2.5, 8, 2); back.position.set(-0.6, 2.6, -1.2); G.add(back);
    G.add(P.dustMotes({ box: [5, 3.5, 6], center: [0, 1.8, 0], count: 200, color: '#d8ccb0', size: 0.016, opacity: 0.4 }));
  }

  // ───────────────────────────────────────────────── south: the front door, the step, the street
  _buildDoor() {
    const G = this.group, S = this.statics;
    const door = F.door({ w: DOOR.w, h: DOOR.h, tint: '#3a2418', bands: false, rune: false, frame: 'wood', seed: 4 });
    door.position.set(DOOR.x, 0, D / 2 - 0.02); door.rotation.y = Math.PI; G.add(door);
    this.door = door; this.leaf = door.userData.leaf;
    // the void plane behind the leaf would hide the street: it becomes the night instead
    door.traverse((o) => { if (o.isMesh && o.material?.color?.getHex?.() === 0x050302 && o.geometry.type === 'PlaneGeometry') o.visible = false; });
    const fan = F.windowFrame({ w: 1.3, h: 0.66, arch: true, panes: [3, 1], frameMaterial: M.walnut({ tint: '#2e1e16' }), sill: false, rain: 0.6, moonlight: true, shaftTarget: [0.2, 0, -1.2], shaftOpacity: 0.1, skyTop: '#070a1c', skyBottom: '#141d3f', moon: [0.5, 0.62] });
    fan.position.set(DOOR.x, 2.22, D / 2 - 0.04); fan.rotation.y = Math.PI; G.add(fan);
    // the coat stand, and the hook by it with nothing on it, or an apron
    const stand = new THREE.Group(); stand.position.set(-2.4, 0, 2.9); S.add(stand);
    const pole = F.lathe([[0.18, 0], [0.18, 0.03], [0.05, 0.05], [0.03, 1.7], [0.05, 1.78], [0.02, 1.86], [0, 1.9]], M.walnut({ tint: '#2a1a12' }), 14); stand.add(pole);
    const coat = F.lathe([[0.02, 1.7], [0.14, 1.6], [0.18, 1.2], [0.2, 0.7], [0.19, 0.62]], new THREE.MeshStandardMaterial({ color: '#1e1a22', roughness: 0.98, side: THREE.DoubleSide }), 18);
    coat.position.set(0.06, 0, 0.06); coat.scale.set(1, 1, 0.6); stand.add(coat);
    // the step and the street beyond the door: a wet flag, the kerb, rain, the van with its hazards on
    const street = new THREE.Group(); street.position.set(DOOR.x, 0, D / 2); G.add(street);
    const stepM = F.rbox(2.2, 0.12, 1.2, M.smoothStone({ color: '#5a5650', roughness: 0.5 }), 0.01); stepM.position.set(0, -0.06, 0.65); street.add(stepM);
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.25, metalness: 0.1 })); pave.rotation.x = -Math.PI / 2; pave.position.set(0, -0.14, 4.2); street.add(pave);
    const sky = makeCanvasPlane(10, 5, (g, w, h) => drawStreet(g, w, h), { px: 1024, emissive: true }); sky.position.set(0, 2.1, 6.9); sky.rotation.y = Math.PI; sky.material.color.setScalar(0.95); street.add(sky);
    // the van: a dark box with a cab, two hazard lamps that blink, and the wet shine under it
    const van = new THREE.Group(); van.position.set(1.6, 0, 4.6); van.rotation.y = Math.PI / 2 + 0.25; street.add(van);
    const vanM = M.matte('#2a2420', { roughness: 0.5, metalness: 0.2 });
    const box = F.rbox(2.4, 1.5, 1.5, vanM, 0.06); box.position.set(0.2, 0.95, 0); van.add(box);
    const cab = F.rbox(1.0, 1.2, 1.45, vanM, 0.08); cab.position.set(-1.4, 0.8, 0); van.add(cab);
    for (const s of [-1, 1]) for (const x of [-1.9, 0.9]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), M.matte('#0c0c0c')); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.3, s * 0.78); van.add(wh); }
    const lampM = new THREE.MeshBasicMaterial({ color: '#ff9a2a', toneMapped: false });
    this.hazards = [];
    for (const s of [-1, 1]) { const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), lampM); lamp.position.set(-1.46, 0.75, s * 0.55); lamp.rotation.y = -Math.PI / 2; van.add(lamp); this.hazards.push(lamp); }
    this.hazardLight = new THREE.PointLight('#ff9a2a', 0, 5, 2); this.hazardLight.position.set(-1.9, 0.8, 0); van.add(this.hazardLight);
    this.streetLight = new THREE.PointLight('#9fb6ff', 0, 8, 2); this.streetLight.position.set(0, 2.4, 1.6); street.add(this.streetLight);
    const rain = P.dustMotes({ box: [4, 3.2, 4], center: [0, 1.6, 2.8], count: 320, color: '#aab8d8', size: 0.012, opacity: 0.0 }); street.add(rain); this.rain = rain;
    this.street = street; this.van = van;
  }

  // ───────────────────────────────────────────────── north: the baize door, and the hook beside it
  _buildBack() {
    const G = this.group, S = this.statics;
    const z = -D / 2 + 0.05;
    const baize = F.rbox(0.9, 2.1, 0.05, new THREE.MeshStandardMaterial({ color: '#1e4a2a', roughness: 1 }), 0.006); baize.position.set(-1.2, 1.05, z + 0.08); baize.rotation.y = 0.9; S.add(baize);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.1), new THREE.MeshStandardMaterial({ color: '#3a1a08', emissive: '#6a2a08', emissiveIntensity: 0.6, roughness: 1 })); opening.position.set(-1.65, 1.05, z); S.add(opening);
    const frame = M.walnut({ tint: '#2a1a12' });
    for (const x of [-2.15, -1.15]) { const p = F.rbox(0.1, 2.2, 0.12, frame, 0.006); p.position.set(x, 1.1, z + 0.04); S.add(p); }
    const head = F.rbox(1.1, 0.1, 0.12, frame, 0.006); head.position.set(-1.65, 2.2, z + 0.04); S.add(head);
    const glow = new THREE.PointLight('#ff9a4a', 1.6, 4, 2); glow.position.set(-1.65, 1.3, z + 0.4); G.add(glow);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 14, Math.PI * 1.2), M.brass()); hook.position.set(-0.75, 1.72, z + 0.06); hook.rotation.z = Math.PI * 0.9; S.add(hook);
    // the apron: a pale bib and skirt, your number on the bib, hanging from the hook. Only in `staff`.
    const apron = new THREE.Group(); apron.position.set(-0.75, 1.7, z + 0.07); apron.visible = false; G.add(apron);
    const cloth = new THREE.MeshStandardMaterial({ color: '#d8cfbd', roughness: 0.95, side: THREE.DoubleSide });
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), cloth); skirt.position.set(0, -0.95, 0.01); apron.add(skirt);
    const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.32), cloth); bib.position.set(0, -0.42, 0.012); apron.add(bib);
    const number = makeCanvasPlane(0.2, 0.08, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${h * 0.7}px "Cormorant Garamond", Georgia, serif`; g.fillText('No. 1031', w / 2, h / 2); }, { px: 256, transparent: true });
    number.position.set(0, -0.4, 0.02); apron.add(number);
    for (const s of [-1, 1]) { const strap = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.3), cloth); strap.position.set(s * 0.06, -0.14, 0.01); strap.rotation.z = -s * 0.25; apron.add(strap); }
    this.apron = apron; this.hookPoint = new THREE.Vector3(-0.75, 1.3, z);
  }

  // ───────────────────────────────────────────────── the people, and the key in your hand
  _buildPeople() {
    const G = this.group;
    this.tallow = makeFigure({ kind: 'tallow' }); this.tallow.position.set(-1.0, 0, 0.2); this.tallow.rotation.y = 0.35; this.tallow.visible = false; G.add(this.tallow);
    this.wick = makeFigure({ kind: 'wick', pose: 'standing' }); this.wick.position.set(-1.6, 0, 0.6); this.wick.rotation.y = 0; this.wick.visible = false; G.add(this.wick);
    this.pell = makeFigure({ kind: 'pell' }); this.pell.position.set(1.5, 0, 0.9); this.pell.rotation.y = 0; this.pell.visible = false; G.add(this.pell);
    this.finch = makeFigure({ kind: 'finch', pose: 'standing' }); this.finch.position.set(DOOR.x + 0.95, -0.14, D / 2 + 3.7); this.finch.rotation.y = 0.5; this.finch.visible = false; G.add(this.finch);
    // the yellow key, held low and to the right until the twelfth strike
    const key = new THREE.Group(); G.add(key); this.key = key;
    const km = M.brass({ color: '#c9b24a', polished: true });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 8, 18), km); key.add(bow);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.008), km); shaft.position.x = 0.07; key.add(shaft);
    const teeth = this.house.teeth;
    for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.007, i < teeth ? 0.012 + (i % 3) * 0.003 : 0.003, 0.006), km); t.position.set(0.04 + i * 0.009, -0.008, 0); key.add(t); }
    key.visible = false;
  }

  // ───────────────────────────────────────────────── the scene
  enter() {
    // rain, wind and the hall clock are the room's ambience bed (Audio.js ROOM_BEDS.midnight)
    this._play().catch((e) => console.error('[midnight]', e));
  }
  exit() {}
  update(dt, t) {
    const on = this._hazardsOn && Math.floor(t * 1.6) % 2 === 0;
    for (const h of this.hazards) h.material.color.set(on ? '#ff9a2a' : '#4a2a10');
    this.hazardLight.intensity = on ? 2.2 : 0;
  }
  _keyPose(k) {
    // from low right, near the camera, to the keyhole plate on the leaf
    const cam = this.ctx.camera.camera;
    const from = cam.position.clone().add(new THREE.Vector3(0.28, -0.3, 0.5));
    const to = new THREE.Vector3(DOOR.x - 0.46, DOOR.h * 0.47 + 0.005, D / 2 - 0.1);
    this.key.position.lerpVectors(from, to, k);
    this.key.rotation.set(0, Math.PI / 2 + (1 - k) * 0.4, (1 - k) * 0.5);
  }
  async _play() {
    const { ctx } = this;
    ctx.hotspots.lock();
    try {
      await ctx.tween.delay(0.9);
      // the last three strikes come down the hall; the twelfth lands as the key reaches the plate
      ctx.audio.clockChime(3);
      this.key.visible = true;
      await ctx.tween.run(2.75, (k) => this._keyPose(k), { ease: 'inOutSine' });
      ctx.camera.shake(0.004, 0.3);
      const e = this.house.ending();
      if (e === 'staff') await this._staff();
      else if (e === 'teeth') await this._teeth();
      else await this._open();
      // no dead air after the last line: a beat, then the fade the card comes up through (under 1.5 s in all)
      await ctx.tween.delay(0.1);
      await ctx.transitions.fadeOut(0.8);
      await this.house.endNight();
    } finally { ctx.hotspots.unlock(); }
  }
  async _staff() {
    const { ctx } = this;
    ctx.audio.play('error', { gain: 0.45, pitch: 0.6 });
    await ctx.tween.delay(0.5);
    // Tallow promised on the stair that the house would read the lines at the door: it does, before the apron
    const n = this.house.unpaid;
    if (n === 1 && ctx.script?.['react.door.read.one']) await ctx.dialogue.say('react.door.read.one');
    else if (n > 0 && ctx.script?.['react.door.read']) {
      const words = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
      const count = `${words[n - 1] || n} lines`;
      await ctx.dialogue.say(ctx.dialogue.resolve('react.door.read').map((l) => ({ ...l, text: l.text.replace('{n}', count) })));
    }
    this.apron.visible = true;
    await ctx.dialogue.say('react.door.staff');
    ctx.camera.lookAtPoint(this.hookPoint);
    await ctx.tween.delay(0.4);
  }
  async _teeth() {
    const { ctx } = this;
    ctx.audio.play('keyTurn', { gain: 0.7, pitch: 0.9 });
    await ctx.tween.delay(0.4);
    ctx.audio.play('error', { gain: 0.5, pitch: 0.5 });
    ctx.camera.shake(0.006, 0.3);
    this.tallow.visible = true;
    this.tallow.userData.lookAt(ctx.camera.camera.position.clone(), 12);
    await ctx.dialogue.say('react.door.teeth');
    ctx.camera.lookAtPoint(this.tallow.position.clone().setY(1.55));
    await ctx.tween.delay(0.4);
  }
  async _open() {
    const { ctx } = this;
    const r = this.house.record().residents;
    await ctx.dialogue.say('react.door.open');
    if (r.wick === 'on the step') {
      this.wick.visible = true;
      await this.wick.userData.walkTo(ctx, [DOOR.x - 0.75, 0, 2.55], { speed: 0.8, faceYaw: 0.35 });
      this.wick.userData.lookAt(ctx.camera.camera.position.clone(), 5);
      await ctx.dialogue.say('react.wick.door');
    }
    ctx.audio.play('keyTurn', { gain: 0.8, pitch: 0.85 });
    await ctx.tween.delay(0.5);
    ctx.audio.play('doorOpen', { gain: 0.8, pitch: 0.9 });
    ctx.audio.play('gust', { gain: 0.6 });
    ctx.audio.loop('rain', { gain: 0.9, fade: 1.2 });
    this.key.visible = false;
    this._hazardsOn = true;
    this.rain.userData.setOpacity?.(0.45);
    ctx.tween.to(this.streetLight, { intensity: 3.2 }, { duration: 1.6 });
    ctx.memorial.visit('step');
    await ctx.tween.to(this.leaf.rotation, { y: 1.75 }, { duration: 1.7, ease: 'outCubic' });
    if (r.pell === 'on the step') {
      this.pell.visible = true;
      // to the left of the step, out of the line from the door to the van (Mr. Finch stands there)
      await this.pell.userData.walkTo(ctx, [DOOR.x - 0.55, 0, D / 2 + 0.5], { speed: 0.75, faceYaw: 0 });
      await ctx.dialogue.say('react.pell.door');
    }
    if (this.house.finchOut) {
      this.finch.visible = true;
      ctx.camera.lookAtPoint(this.finch.position.clone().setY(1.3));
      await ctx.tween.delay(0.6);
      await ctx.dialogue.say('react.finch.van');
    } else if (r.pell !== 'on the step' && r.wick !== 'on the step') {
      await ctx.dialogue.say('react.door.street');
    }
  }
}

// ───────────────────────────────────────────────── the street at the end of the night
function drawStreet(g, w, h) {
  const r = rng(17);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#05070f'); sky.addColorStop(0.55, '#121a2e'); sky.addColorStop(1, '#0a0c12');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // the terrace opposite: dark fronts, two lit windows, a lamp post
  g.fillStyle = '#0b0e16';
  for (let i = 0; i < 7; i++) { const x = i * (w / 7), hh = h * (0.45 + r() * 0.12); g.fillRect(x, h - hh, w / 7 + 2, hh); g.fillStyle = '#0b0e16'; }
  g.fillStyle = 'rgba(255,200,120,0.55)'; g.fillRect(w * 0.22, h * 0.58, w * 0.02, h * 0.035); g.fillRect(w * 0.71, h * 0.62, w * 0.02, h * 0.035);
  g.fillStyle = '#141820'; g.fillRect(w * 0.5 - 3, h * 0.35, 6, h * 0.45);
  const lamp = g.createRadialGradient(w * 0.5, h * 0.36, 2, w * 0.5, h * 0.36, w * 0.09); lamp.addColorStop(0, 'rgba(230,220,180,0.9)'); lamp.addColorStop(1, 'rgba(230,220,180,0)');
  g.fillStyle = lamp; g.fillRect(0, 0, w, h);
  // the road, wet, with the lamp in it
  g.fillStyle = '#15171c'; g.fillRect(0, h * 0.8, w, h * 0.2);
  g.fillStyle = 'rgba(230,220,180,0.12)'; g.fillRect(w * 0.47, h * 0.8, w * 0.06, h * 0.2);
  g.fillStyle = '#2a2c30'; g.fillRect(0, h * 0.79, w, h * 0.015);
  // rain
  g.strokeStyle = 'rgba(180,200,240,0.16)'; g.lineWidth = 1;
  for (let i = 0; i < 600; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 16); g.stroke(); }
}
