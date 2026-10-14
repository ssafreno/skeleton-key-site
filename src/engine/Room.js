import * as THREE from 'three';

/**
 * Base class for rooms. Extend it, set the statics, implement build/enter/exit/update.
 * Conventions: metres, +Y up, the room group's origin is the floor centre, eye height 1.6.
 */
export class Room {
  static id = 'room';
  static title = '';
  static vantage = { position: [0, 1.6, 2.6], lookAt: [0, 1.4, 0], yawLimit: 70, pitchLimit: 25, fov: 60 };
  static puzzleOrder = [];

  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = this.constructor.id;
    this.built = false;
    // Scene look, applied by Game on enter / title. Set these in build().
    this.background = new THREE.Color(0x0b0806);
    this.fog = null;                 // e.g. new THREE.FogExp2(0x1a1008, 0.04)
    this.envIntensity = 0.35;        // scene.environmentIntensity (reflections on brass etc.)
    this.exposure = 1.0;             // renderer tone mapping exposure
    this.bloom = null;               // null = engine default, or { strength, threshold, radius }
    this._updaters = new Set();
  }

  get id() { return this.constructor.id; }

  /** Called once, lazily, before the first enter (or title). Build geometry, lights, hotspots; restore solved visuals from ctx.state. */
  async build() {}

  /** Called on each entry. Place the cat, start loops, play the intro once. */
  enter({ from } = {}) {}

  /** Title-screen background mode: no dialogue, no hotspots. Default: nothing. Override to place the cat etc. */
  enterTitle() {}

  /** Called on leaving. Stop loops. */
  exit() {}

  /** Per-frame. */
  update(dt, t) {}

  /** Hints: is this puzzle currently attemptable? */
  prereqMet(puzzleId) { return true; }

  /**
   * Register something animated: an Object3D with `userData.update(dt, t)` or a function (dt, t) => {}.
   * Objects built by the props library that carry userData.update and are inside this.group at the end of
   * build() are registered automatically.
   * Returns an unregister function.
   */
  animate(objOrFn) {
    const fn = typeof objOrFn === 'function' ? objOrFn : objOrFn?.userData?.update;
    if (!fn) return () => {};
    this._updaters.add(fn);
    return () => this._updaters.delete(fn);
  }

  /** Engine internal: collect props' userData.update after build. */
  _collectUpdaters() {
    this.group.traverse((o) => { if (typeof o.userData?.update === 'function') this._updaters.add(o.userData.update); });
  }

  /** Engine internal: per-frame. */
  _tick(dt, t) {
    for (const fn of this._updaters) {
      try { fn(dt, t); } catch (e) { console.error(e); this._updaters.delete(fn); }
    }
    this.update(dt, t);
  }
}
