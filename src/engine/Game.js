import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { CameraRig } from './CameraRig.js';
import { Interaction } from './Interaction.js';
import { State } from './State.js';
import { Inventory } from './Inventory.js';
import { Dialogue } from './Dialogue.js';
import { Papers } from './Papers.js';
import { HUD } from './HUD.js';
import { Title } from './Title.js';
import { Transitions } from './Transitions.js';
import { Tween } from './Tween.js';
import { Hints } from './Hints.js';
import { AudioEngine } from './Audio.js';
import { House } from './House.js';
import { Card } from './Card.js';
import { Memorial } from './Memorial.js';
import { store, SLOT } from './storage.js';

async function loadContent(path, names) {
  try {
    const mod = await import(path);
    for (const n of names) if (mod[n]) return mod[n];
    if (mod.default) return mod.default;
    console.warn(`[content] ${path} has no export named ${names.join('/')}`);
  } catch (e) {
    console.warn(`[content] could not load ${path}:`, e.message);
  }
  return {};
}

function parseFlags() {
  const q = new URLSearchParams(location.search);
  const list = (k) => (q.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const flags = {};
  for (const kv of list('flags')) {
    const [k, v = 'true'] = kv.split('=');
    flags[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
  }
  return {
    room: q.get('room'),
    dev: q.has('dev') && q.get('dev') !== '0',
    bloom: !q.has('nobloom'),
    lowq: q.has('lowq'),
    keep: q.has('keep'),
    forget: q.has('forget'),
    mute: q.has('mute'),
    solve: list('solve'),
    items: list('items'),
    house: list('house'),
    flags,
  };
}

/** Builds a tiny warm "room" and PMREMs it so metals (brass, iron, glass) have something to reflect. */
function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x2a1c14, side: THREE.BackSide }));
  box.position.y = 2;
  s.add(box);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0x1a110b }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.99;
  s.add(floor);
  const panel = (color, intensity, w, h, pos, rotY = 0, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(rotX, rotY, 0);
    s.add(m);
  };
  panel(0xffb066, 6, 2.2, 1.4, [-4.9, 1.6, 0.5], Math.PI / 2);   // warm fire-ish
  panel(0xffd9a0, 3.5, 1.4, 1.4, [0, 4.9, 0], 0, Math.PI / 2);   // ceiling glow
  panel(0x9fb8ff, 3, 1.2, 2.2, [4.9, 2, -1.5], -Math.PI / 2);    // cool window
  panel(0xffc890, 2, 3, 1, [0, 1.5, -4.9]);                     // back warm
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export class Game {
  /**
   * @param {{ rooms: Array<typeof import('./Room.js').Room>, startRoom?: string }} opts
   */
  constructor({ rooms = [], startRoom = 'foyer' } = {}) {
    this.flags = parseFlags();
    this.dev = this.flags.dev;
    this.startRoom = startRoom;
    this.registry = new Map();
    for (const R of rooms) this.register(R);
    this.instances = new Map();
    this.currentRoom = null;
    this.timerRunning = false;
    this._titleMode = false;
    this._transitioning = false;
    this.time = 0;
  }

  register(RoomClass) {
    if (!RoomClass || !RoomClass.id) { console.warn('[game] room class without static id', RoomClass); return; }
    this.registry.set(RoomClass.id, RoomClass);
  }

  get roomIds() { return [...this.registry.keys()]; }
  get elapsed() { return this.ctx.state.elapsed; }

  async init() {
    const loading = document.createElement('div');
    loading.className = 'oc-loading';
    loading.textContent = 'Finding the house…';
    document.body.appendChild(loading);
    this._loading = loading;

    // fonts first: canvas textures bake text at build time
    if (document.fonts) {
      const faces = ['500 32px "Cormorant Garamond"', 'italic 500 32px "Cormorant Garamond"', '600 32px "Cormorant Garamond"', '700 32px "Cormorant Garamond"', '500 16px "Inter"'];
      await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 2500))]);
    }

    const [script, papers, items] = await Promise.all([
      loadContent('../content/script.js', ['script', 'SCRIPT']),
      loadContent('../content/papers.js', ['papers', 'PAPERS']),
      loadContent('../content/items.js', ['items', 'ITEMS']),
    ]);

    const canvas = document.getElementById('game-canvas');
    const ui = document.getElementById('ui');
    this._vignetteEl = document.createElement('div');
    this._vignetteEl.className = 'oc-vignette';
    canvas.after(this._vignetteEl);
    const renderer = new Renderer(canvas, { bloom: this.flags.bloom, lowQuality: this.flags.lowq });
    renderer.three.info.autoReset = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0806);
    scene.environment = makeEnvironment(renderer.three);
    scene.environmentIntensity = 0.35;

    const ctx = {
      game: this, scene, renderer, ui, THREE,
      script, papers, items,
      tween: new Tween(),
      state: new State(),
    };
    this.ctx = ctx;
    ctx.audio = new AudioEngine();
    if (store.get('skeleton-key.muted') === '1' || this.flags.mute) ctx.audio.setMuted(true);
    this.slot = SLOT;
    if (SLOT) console.log(`[game] save slot "${SLOT}"`);
    ctx.transitions = new Transitions(ctx);
    ctx.transitions.cover();
    ctx.hud = new HUD(ctx);
    ctx.camera = new CameraRig(ctx);
    ctx.hotspots = new Interaction(ctx, canvas);
    ctx.inventory = new Inventory(ctx);
    ctx.dialogue = new Dialogue(ctx);
    ctx.memorial = new Memorial();     // nights and rooms, kept across runs
    if (this.flags.forget) ctx.memorial.clear();
    ctx.paperDefs = papers;            // raw content from content/papers.js
    ctx.papers = new Papers(ctx);      // the Papers UI (contract name)
    ctx.hints = new Hints(ctx);
    ctx.title = new Title(ctx);
    ctx.house = new House(ctx);
    ctx.card = new Card(ctx);
    ctx.hud.syncMute();
    if (this.dev) ctx.hud.enableFps();

    renderer.setScene(scene, ctx.camera.camera);
    this.scene = scene;
    this.renderer = renderer;

    window.addEventListener('keydown', (e) => this._onKey(e));

    this._clock = new THREE.Clock();
    renderer.three.setAnimationLoop(() => this._frame());
    // When the browser throttles requestAnimationFrame (an embedded pane, a busy machine) tweens crawl and a dial
    // clicked twice seems to ignore the second click. If no frame has run for a while, drive one from a timer.
    this._lastFrameAt = performance.now();
    this._watchdog = setInterval(() => {
      if (!document.hidden && performance.now() - this._lastFrameAt > 120) this._frame();
    }, 50);
    window.skeletonKey = this; // debugging handle
    return this;
  }

  _onKey(e) {
    if (e.key !== 'Escape') return;
    const c = this.ctx;
    if (c.hud._confirmClose) { c.hud._confirmClose(); return; }
    if (c.papers.isOpen) { c.papers.hide(); return; }
    if (c.inventory.inspecting) { c.inventory.closeInspect(); return; }
    // a line on screen closes with the close-up (a choice must be answered: Esc leaves it be)
    if (c.dialogue.choosing) return;
    const closedLine = c.dialogue.isOpen ? c.dialogue.dismiss() : false;
    if (c.camera.inFocus && !this._transitioning && !c.hotspots.locked) { c.camera.exitFocus(); return; }
    if (closedLine) return;
    if (c.inventory.selected) { c.inventory.deselect(); return; }
    this._roomBack();
  }

  /**
   * HUD Back (and Esc with nothing else to close): leave the close-up; with no close-up open, ask the room first
   * (`room.onBack()`: return true when it handled it, e.g. the landing walking down, the cellar turning from the stair).
   */
  back() {
    const c = this.ctx;
    if (c.camera.inFocus) { c.camera.exitFocus(); return; }
    this._roomBack();
  }
  _roomBack() {
    const c = this.ctx;
    if (this._transitioning || c.hotspots.locked || this._titleMode) return false;
    try { return !!this.currentRoom?.onBack?.(); } catch (err) { console.error(err); return false; }
  }

  /** Start according to URL flags: ?room= jumps straight in (fresh state unless &keep), else the title. */
  async boot() {
    const f = this.flags;
    if (f.room) {
      const { state, inventory } = this.ctx;
      if (!f.keep || !state.load()) { state.reset(); this._startKit(); }
      for (const id of f.solve) state.solve(id);
      for (const [k, v] of Object.entries(f.flags)) state.set(k, v);
      for (const id of f.items) inventory.add(id, { silent: true });
      if (f.house.length) this.ctx.house.devApply(f.house);
      if (!this.registry.has(f.room)) console.warn(`[game] ?room=${f.room} is not registered. Registered: ${this.roomIds.join(', ')}`);
      this._hideLoading();
      await this.goToRoom(this.registry.has(f.room) ? f.room : this._fallbackRoom(), { fade: false });
      return;
    }
    this.ctx.state.load();
    await this.showTitle();
  }

  /** What the locksmith walks in with: pliers and the ring with the yellow key. */
  _startKit() {
    this.ctx.inventory.add('pliers', { silent: true });
    this.ctx.inventory.add('bonekey', { silent: true });
    this.ctx.house.reset();
  }

  _fallbackRoom() {
    if (this.registry.has(this.startRoom)) return this.startRoom;
    const first = this.roomIds.find((id) => !id.startsWith('_')) || this.roomIds[0];
    console.warn(`[game] startRoom "${this.startRoom}" is not registered; falling back to "${first}"`);
    return first;
  }

  _hideLoading() {
    if (!this._loading) return;
    const l = this._loading;
    l.classList.add('oc-hidden');
    setTimeout(() => l.remove(), 700);
    this._loading = null;
  }

  async _ensureBuilt(id) {
    if (this.instances.has(id)) return this.instances.get(id);
    const Cls = this.registry.get(id);
    const room = new Cls(this.ctx);
    this.instances.set(id, room);
    try {
      await room.build();
    } catch (e) {
      console.error(`[game] ${id}.build() failed`, e);
      this.ctx.hud.toast(`Room "${id}" failed to build — see console`);
    }
    room._collectUpdaters();
    room.built = true;
    return room;
  }

  /** Drop every built room so the next visit rebuilds it from current state (used after a reset). */
  _discardInstances() {
    // The current (title backdrop) room stays on screen; goToRoom removes its group as `prev`.
    for (const room of this.instances.values()) if (room !== this.currentRoom) this.ctx.scene.remove(room.group);
    this.instances.clear();
  }

  _applyLook(room) {
    const { scene, renderer } = this.ctx;
    scene.background = room.background ?? new THREE.Color(0x0b0806);
    scene.fog = room.fog ?? null;
    scene.environmentIntensity = room.envIntensity ?? 0.35;
    renderer.setExposure(room.exposure ?? 1);
    // polish: soft screen-space corner darkening (a CSS layer, no extra draw call). Rooms that glue their own
    // vignette to the camera (room1: `this.vignette`) or set `cssVignette = false` opt out; a number sets strength.
    const v = room.cssVignette ?? (room.vignette ? false : 1);
    this._vignetteEl.style.opacity = v === false ? '0' : String(v);
    if (room.bloom) renderer.setBloom(room.bloom.strength ?? renderer.baseBloom.strength, room.bloom);
    else renderer.resetBloom();
  }

  async _precompile(room) {
    try { await this.ctx.renderer.three.compileAsync(this.ctx.scene, this.ctx.camera.camera); } catch (e) { /* not fatal */ }
  }

  /** Show the title screen over a slowly panning room, then start/continue. */
  async showTitle() {
    const ctx = this.ctx;
    const bgId = this.registry.has(this.startRoom) ? this.startRoom : this.roomIds.find((id) => !id.startsWith('_')) || this.roomIds[0];
    ctx.hud.setVisible(false);
    ctx.inventory.setVisible(false);
    ctx.hotspots.enabled = false;
    ctx.camera.enabled = false;
    this._titleMode = true;
    if (bgId) {
      const room = await this._ensureBuilt(bgId);
      this._applyLook(room);
      ctx.scene.add(room.group);
      this.currentRoom = room;
      ctx.camera.setVantage(room.constructor.vantage);
      ctx.camera.autoPan = { speed: 0.06, amp: 0.8 };
      try { room.enterTitle(); } catch (e) { console.error(e); }
      await this._precompile(room);
    }
    this._hideLoading();
    ctx.transitions.fadeIn(1.4);
    const act = await ctx.title.show({ canContinue: ctx.state.hasSave(), night: ctx.memorial.night });
    ctx.audio.resume?.();
    if (act === 'new') {
      ctx.state.reset();
      ctx.inventory.render();
      this._discardInstances(); // the title backdrop was built from the old save; rebuild from fresh state
    }
    let target = act === 'continue' && this.registry.has(ctx.state.room) ? ctx.state.room : this._fallbackRoom();
    if (act === 'new') {
      ctx.state.data.started = true;
      this._startKit();
    }
    await ctx.transitions.fadeOut(0.8);
    ctx.title.hide();
    ctx.camera.autoPan = null;
    ctx.camera.enabled = true;
    ctx.hotspots.enabled = true;
    await this.goToRoom(target, { fade: false });
  }

  /**
   * Fade to black, swap rooms, fade in. Builds the room lazily on first visit.
   * @param {string} id
   * @param {{ fade?: boolean, duration?: number }} [opts]
   */
  async goToRoom(id, { fade = true, duration = 0.6 } = {}) {
    const ctx = this.ctx;
    if (!this.registry.has(id)) { console.error(`[game] goToRoom: unknown room "${id}"`); return; }
    if (this._transitioning) return;
    this._transitioning = true;
    ctx.hotspots.lock();
    try {
      if (fade && this.currentRoom) await ctx.transitions.fadeOut(duration);
      else if (ctx.transitions.opacity < 1) ctx.transitions.cover();
      const prev = this.currentRoom;
      const from = this._titleMode ? null : prev?.id ?? null;
      ctx.camera.resetFocus();
      ctx.dialogue.hideCaption();
      ctx.papers.hide();
      if (prev) {
        if (!this._titleMode) { try { prev.exit(); } catch (e) { console.error(e); } }
        ctx.scene.remove(prev.group);
      }
      this._titleMode = false;
      const room = await this._ensureBuilt(id);
      this._applyLook(room);
      ctx.scene.add(room.group);
      this.currentRoom = room;
      ctx.camera.setVantage(room.constructor.vantage);
      ctx.hotspots.resetForRoom();
      ctx.hints.resetForRoom();
      ctx.state.room = id;
      ctx.state.data.started = true;
      ctx.memorial.visit(id);
      ctx.state.save();
      ctx.audio.setRoomAmbience?.(id);
      ctx.hud.setVisible(true);
      ctx.inventory.setVisible(true);
      this.timerRunning = true;
      await this._precompile(room);
      try {
        const r = room.enter({ from });
        if (r && r.catch) r.catch((e) => console.error(`[game] ${id}.enter() failed`, e));
      } catch (e) { console.error(`[game] ${id}.enter() failed`, e); }
      await ctx.transitions.fadeIn(duration);
    } finally {
      ctx.hotspots.unlock();
      this._transitioning = false;
    }
  }

  /** Stop/start the elapsed timer (e.g. the ending stops it). */
  stopTimer() { this.timerRunning = false; this.ctx.state.save(); }
  startTimer() { this.timerRunning = true; }

  /** Wipe the save and reload the page. */
  restart() {
    this.ctx.state.reset();
    this.ctx.state.persist = false; // don't let beforeunload re-save the old run
    location.reload();
  }

  /** Run one frame soon (after a click), so what the click changed is drawn even if rAF is throttled. */
  kick() {
    if (this._kickPending) return;
    this._kickPending = true;
    setTimeout(() => { this._kickPending = false; if (performance.now() - this._lastFrameAt > 20) this._frame(); }, 0);
  }

  _frame() {
    const ctx = this.ctx;
    this._lastFrameAt = performance.now();
    const dt = Math.min(0.1, this._clock.getDelta());
    this.time += dt;
    const t = this.time;
    const info = ctx.renderer.three.info.render;
    this.lastFrameInfo = { calls: info.calls, triangles: info.triangles };
    ctx.renderer.three.info.reset();
    ctx.tween.update(dt);
    if (this.currentRoom) this.currentRoom._tick(dt, t);
    ctx.camera.update(dt, t);
    ctx.hotspots.update(dt, t);
    ctx.dialogue.update(dt);
    ctx.hints.update(dt);
    if (this.timerRunning && !this._titleMode && !document.hidden) ctx.state.tick(dt);
    ctx.hud.update(dt);
    ctx.renderer.render(dt);
  }
}
