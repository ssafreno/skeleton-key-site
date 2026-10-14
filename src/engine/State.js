// Persistent game state: flags, solved puzzles, inventory, current room, elapsed time.
// localStorage key: 'skeleton-key.save.v1' (namespaced by `?slot=`, see storage.js).
import { store } from './storage.js';

export const SAVE_KEY = 'skeleton-key.save.v1';

function blank() {
  return { v: 1, flags: {}, solved: {}, inventory: [], room: null, elapsed: 0, started: false, savedAt: 0 };
}

export class State {
  constructor({ persist = true } = {}) {
    this.persist = persist;
    this.data = blank();
    this._listeners = new Map();
    this._saveTimer = null;
    this._lastElapsedSave = 0;
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
  }

  // ---- events --------------------------------------------------------------
  /** on('change', (key, value) => {}) | on('solve', (id) => {}) | on('inventory', (list) => {}) | on('reset', () => {}) */
  on(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, new Set());
    this._listeners.get(evt).add(fn);
    return () => this._listeners.get(evt)?.delete(fn);
  }
  _emit(evt, ...args) {
    for (const fn of this._listeners.get(evt) || []) { try { fn(...args); } catch (e) { console.error(e); } }
  }

  // ---- flags ---------------------------------------------------------------
  get(key, fallback = undefined) {
    return Object.prototype.hasOwnProperty.call(this.data.flags, key) ? this.data.flags[key] : fallback;
  }
  set(key, value) {
    if (this.data.flags[key] === value) return;
    if (value === undefined) delete this.data.flags[key];
    else this.data.flags[key] = value;
    this._emit('change', key, value);
    this._queueSave();
  }
  /** Increment a numeric flag, returns the new value. */
  inc(key, by = 1) { const v = (this.get(key, 0) || 0) + by; this.set(key, v); return v; }

  // ---- puzzles -------------------------------------------------------------
  solve(id) {
    if (this.isSolved(id)) return;
    this.data.solved[id] = Math.round(this.data.elapsed);
    this._emit('solve', id);
    this.save();
  }
  isSolved(id) { return Object.prototype.hasOwnProperty.call(this.data.solved, id); } // a solve at elapsed 0 (e.g. ?solve=) stores 0
  unsolve(id) { delete this.data.solved[id]; this._queueSave(); }

  // ---- inventory (managed by Inventory) ------------------------------------
  get inventory() { return this.data.inventory; }
  set inventory(list) { this.data.inventory = [...list]; this._emit('inventory', this.data.inventory); this._queueSave(); }

  // ---- misc ----------------------------------------------------------------
  get room() { return this.data.room; }
  set room(id) { this.data.room = id; this._queueSave(); }
  get elapsed() { return this.data.elapsed; }
  set elapsed(s) { this.data.elapsed = s; }
  /** Called by Game per frame while the timer runs. Saves every ~5 s. */
  tick(dt) {
    this.data.elapsed += dt;
    if (this.data.elapsed - this._lastElapsedSave > 5) { this._lastElapsedSave = this.data.elapsed; this.save(); }
  }

  // ---- persistence ---------------------------------------------------------
  _queueSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this.save(); }, 50);
  }
  save() {
    if (!this.persist) return;
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    this.data.savedAt = Date.now();
    store.set(SAVE_KEY, JSON.stringify(this.data));
  }
  load() {
    try {
      const raw = store.get(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1) return false;
      this.data = { ...blank(), ...d };
      this._lastElapsedSave = this.data.elapsed;
      this._emit('inventory', this.data.inventory);
      return true;
    } catch (e) { return false; }
  }
  hasSave() {
    try {
      const d = JSON.parse(store.get(SAVE_KEY) || 'null');
      return !!(d && d.v === 1 && d.started);
    } catch (e) { return false; }
  }
  reset() {
    this.data = blank();
    this._lastElapsedSave = 0;
    store.remove(SAVE_KEY);
    this._emit('reset');
    this._emit('inventory', this.data.inventory);
  }
}
