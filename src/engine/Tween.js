// Tiny promise-based tween utility. Driven by Game's frame loop (game time, seconds).
//   await tween.to(mesh.position, { x: 1, y: 2 }, { duration: 0.7, ease: 'inOutCubic' });
//   await tween.to(mesh, { position: { y: 1 }, rotation: { z: Math.PI } }, { duration: 1 });
//   await tween.delay(0.5);
//   await tween.run(1.2, (k) => { light.intensity = k * 3; }, { ease: 'outQuad' });

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

function collect(target, props, out) {
  for (const k of Object.keys(props)) {
    const v = props[k];
    if (v !== null && typeof v === 'object') {
      if (target[k] == null) continue;
      collect(target[k], v, out);
    } else if (typeof v === 'number' && typeof target[k] === 'number') {
      out.push({ obj: target, key: k, from: target[k], to: v });
    }
  }
  return out;
}

export class Tween {
  constructor() {
    this._active = new Set();
    this.time = 0;
  }

  /**
   * Tween numeric props of target (nested objects allowed). Returns a Promise resolved on completion
   * (also resolved — never rejected — when killed). The promise has a `.cancel()` method.
   */
  to(target, props, { duration = 0.7, ease = 'inOutCubic', delay = 0, onUpdate, onComplete } = {}) {
    let resolve;
    const p = new Promise((r) => (resolve = r));
    const job = {
      target,
      props,
      tracks: null,
      t: -delay,
      duration: Math.max(1e-4, duration),
      ease: typeof ease === 'function' ? ease : Ease[ease] || Ease.inOutCubic,
      onUpdate,
      onComplete,
      resolve,
      done: false,
    };
    this._active.add(job);
    p.cancel = () => this._finish(job, false);
    return p;
  }

  /**
   * Relative tween: add `deltas` to the props, counted from where any tween already running on them will END (not from
   * the half-way value), so rapid clicks on a dial or drum each land a whole step: `tween.by(ring.rotation, { y: -step })`.
   * Takes over those props from the earlier tween. Same options and promise as `to()`.
   */
  by(target, deltas, opts = {}) {
    const props = {};
    const build = (obj, d, out) => {
      for (const k of Object.keys(d)) {
        const v = d[k];
        if (v !== null && typeof v === 'object') { if (obj[k] != null) { out[k] = {}; build(obj[k], v, out[k]); } }
        else if (typeof v === 'number' && typeof obj[k] === 'number') out[k] = this._pendingEnd(obj, k) + v;
      }
    };
    build(target, deltas, props);
    return this.to(target, props, opts);
  }

  /** Where obj[key] will end up once the tweens already driving it finish (its current value if none). */
  _pendingEnd(obj, key) {
    let end = obj[key];
    for (const j of this._active) {
      if (j.done) continue;
      if (j.tracks) { for (const tr of j.tracks) if (tr.obj === obj && tr.key === key) end = tr.to; }
      else { const p = this._findProp(j.target, j.props, obj, key); if (p !== undefined) end = p; }
    }
    return end;
  }
  _findProp(target, props, obj, key) {
    if (target === obj && typeof props[key] === 'number') return props[key];
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v !== null && typeof v === 'object' && target[k] != null) { const r = this._findProp(target[k], v, obj, key); if (r !== undefined) return r; }
    }
    return undefined;
  }

  /** Run a callback with eased progress k ∈ [0,1] over `duration` seconds. */
  run(duration, fn, { ease = 'linear', delay = 0 } = {}) {
    const proxy = { k: 0 };
    return this.to(proxy, { k: 1 }, { duration, ease, delay, onUpdate: () => fn(proxy.k) });
  }

  delay(seconds) {
    return this.to({ v: 0 }, { v: 1 }, { duration: seconds, ease: 'linear' });
  }

  /** Stop all tweens on a target (their promises resolve immediately, values stay where they are). */
  kill(target) {
    for (const j of this._active) if (j.target === target) this._finish(j, false);
  }

  killAll() {
    for (const j of this._active) this._finish(j, false);
  }

  _finish(job, complete) {
    if (job.done) return;
    job.done = true;
    this._active.delete(job);
    if (complete) {
      try { job.onComplete?.(); } catch (e) { console.error(e); }
    }
    job.resolve();
  }

  update(dt) {
    this.time += dt;
    for (const job of [...this._active]) {
      if (job.done) continue;
      job.t += dt;
      if (job.t < 0) continue;
      if (!job.tracks) {
        job.tracks = collect(job.target, job.props, []);
        // a newer tween on the same prop takes it over: the older one stops writing it (no tug-of-war, no snap back)
        for (const other of this._active) {
          if (other === job || other.done || !other.tracks) continue;
          other.tracks = other.tracks.filter((tr) => !job.tracks.some((n) => n.obj === tr.obj && n.key === tr.key));
        }
      }
      const raw = Math.min(1, job.t / job.duration);
      const k = job.ease(raw);
      for (const tr of job.tracks) tr.obj[tr.key] = tr.from + (tr.to - tr.from) * k;
      try { job.onUpdate?.(k, raw); } catch (e) { console.error(e); }
      if (raw >= 1) this._finish(job, true);
    }
  }
}
