import { renderIcon } from './icons.js';

const MIN_SLOTS = 8;
const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg>';

/**
 * Inventory bar + selection + inspect popup. Data lives in state.inventory (array of item ids).
 */
export class Inventory {
  constructor(ctx) {
    this.ctx = ctx;
    this.selected = null;
    this._iconCache = new Map();
    this._slots = [];

    this.el = document.createElement('div');
    this.el.className = 'oc-inv oc-hidden';
    ctx.ui.appendChild(this.el);

    ctx.state.on('inventory', () => this.render());
    ctx.state.on('reset', () => { this.selected = null; this._applyCursor(); });
    this.render();
  }

  get items() { return this.ctx.state.inventory; }
  has(id) { return this.items.includes(id); }

  setVisible(b) { this.el.classList.toggle('oc-hidden', !b); }

  _def(id) { return this.ctx.items?.[id] || null; }
  name(id) { return this._def(id)?.name || id; }

  icon(id, size = 128) {
    const key = `${id}@${size}`;
    if (!this._iconCache.has(key)) this._iconCache.set(key, renderIcon(id, size, this._def(id)));
    return this._iconCache.get(key);
  }

  /** Drop cached icons for an item and redraw its slot (the yellow key loses teeth). */
  refreshIcon(id) {
    for (const k of [...this._iconCache.keys()]) if (k.startsWith(`${id}@`)) this._iconCache.delete(k);
    this.render();
    if (this.selected === id) this._applyCursor();
  }

  /** Add an item: plays pickup, flies the icon in from `from` (screen {x,y} | world THREE.Vector3 | Object3D; default screen centre). */
  add(id, { from, silent = false } = {}) {
    if (this.has(id)) return;
    this.ctx.state.inventory = [...this.items, id];
    if (!silent) {
      this.ctx.audio?.play('pickup');
      this._flyIn(id, from);
    }
  }

  remove(id) {
    if (!this.has(id)) return;
    if (this.selected === id) this.deselect();
    this.ctx.state.inventory = this.items.filter((x) => x !== id);
  }

  select(id) {
    if (!this.has(id)) return;
    this.selected = id;
    this.ctx.audio?.play('select', { gain: 0.6 });
    this._applyCursor();
    this._syncSelection();
  }

  deselect() {
    if (!this.selected) return;
    this.selected = null;
    this.ctx.audio?.play('drop', { gain: 0.4 });
    this._applyCursor();
    this._syncSelection();
  }

  toggle(id) { if (this.selected === id) this.deselect(); else this.select(id); }

  /** Wiggle an item slot (used for hints). */
  flash(id) {
    const s = this._slots.find((x) => x.dataset.id === id);
    if (!s) return;
    s.classList.remove('oc-wiggle');
    void s.offsetWidth;
    s.classList.add('oc-wiggle');
  }

  _applyCursor() {
    const id = this.selected;
    document.body.classList.toggle('oc-has-item', !!id);
    if (id) {
      const c = this.icon(id, 48);
      document.documentElement.style.setProperty('--item-cursor', `url(${c.toDataURL()}) 24 24, pointer`);
    }
  }

  _syncSelection() {
    for (const s of this._slots) s.classList.toggle('oc-selected', !!s.dataset.id && s.dataset.id === this.selected);
  }

  render() {
    if (this.selected && !this.has(this.selected)) { this.selected = null; this._applyCursor(); }
    this.el.innerHTML = '';
    this._slots = [];
    const n = Math.max(MIN_SLOTS, this.items.length);
    for (let i = 0; i < n; i++) {
      const id = this.items[i];
      const slot = document.createElement('button');
      slot.className = 'oc-slot';
      slot.type = 'button';
      if (!id) {
        slot.classList.add('oc-empty');
        slot.tabIndex = -1;
      } else {
        slot.dataset.id = id;
        slot.setAttribute('aria-label', this.name(id));
        slot.appendChild(this.icon(id, 128).cloneNode(false));
        // cloneNode doesn't copy pixels — redraw onto the clone
        slot.firstChild.getContext('2d').drawImage(this.icon(id, 128), 0, 0);
        const tip = document.createElement('span');
        tip.className = 'oc-slot-tip';
        tip.textContent = this.name(id);
        slot.appendChild(tip);
        const insp = document.createElement('span');
        insp.className = 'oc-inspect';
        insp.title = 'Inspect';
        insp.innerHTML = EYE_SVG;
        insp.addEventListener('click', (e) => { e.stopPropagation(); this.inspect(id); });
        slot.appendChild(insp);
        slot.addEventListener('click', () => this.toggle(id));
        slot.addEventListener('dblclick', (e) => { e.preventDefault(); this.inspect(id); });
        slot.addEventListener('contextmenu', (e) => { e.preventDefault(); this.deselect(); });
      }
      this.el.appendChild(slot);
      this._slots.push(slot);
    }
    this._syncSelection();
  }

  _slotRect(id) {
    const s = this._slots.find((x) => x.dataset.id === id);
    return s ? s.getBoundingClientRect() : null;
  }

  /** Convert {x,y} | THREE.Vector3 (world) | Object3D into screen coords. */
  _screenFrom(from) {
    if (!from) return null;
    let v = null;
    if (from.isObject3D) { v = from.getWorldPosition(from.position.clone()); }
    else if (from.isVector3) v = from.clone();
    if (!v) return from;
    const cam = this.ctx.camera.camera;
    v.project(cam);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  _flyIn(id, fromRaw) {
    const from = this._screenFrom(fromRaw);
    const target = this._slotRect(id);
    if (!target) return;
    const slot = this._slots.find((x) => x.dataset.id === id);
    slot.style.opacity = '0';
    const c = this.icon(id, 256);
    const img = document.createElement('img');
    img.src = c.toDataURL();
    img.className = 'oc-fly';
    const big = 150;
    img.style.width = img.style.height = big + 'px';
    document.body.appendChild(img);
    const sx = (from?.x ?? window.innerWidth / 2) - big / 2;
    const sy = (from?.y ?? window.innerHeight * 0.42) - big / 2;
    const tx = target.left + target.width / 2 - big / 2;
    const ty = target.top + target.height / 2 - big / 2;
    const sTo = target.width / big;
    const anim = img.animate([
      { transform: `translate(${sx}px, ${sy}px) scale(0.2) rotate(-20deg)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy}px) scale(1.08) rotate(4deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${sx}px, ${sy}px) scale(1) rotate(0deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${tx}px, ${ty}px) scale(${sTo}) rotate(0deg)`, opacity: 1 },
    ], { duration: 1300, easing: 'cubic-bezier(.45,0,.25,1)' });
    anim.onfinish = () => {
      img.remove();
      slot.style.opacity = '';
      slot.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    };
  }

  /** Show the inspect popup for an item. Returns a promise resolved on close. */
  inspect(id) {
    const def = this._def(id);
    this.ctx.audio?.play('page', { gain: 0.5 });
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'oc-modal-backdrop';
      const card = document.createElement('div');
      card.className = 'oc-inspect-card';
      const c = this.icon(id, 400);
      const cv = document.createElement('canvas');
      cv.width = cv.height = 400;
      cv.getContext('2d').drawImage(c, 0, 0);
      const h = document.createElement('h3');
      h.textContent = this.name(id);
      const p = document.createElement('p');
      p.textContent = def?.examine || '';
      const hint = document.createElement('div');
      hint.className = 'oc-hint';
      hint.textContent = 'Click anywhere to close';
      card.append(cv, h, p, hint);
      back.appendChild(card);
      this.ctx.ui.appendChild(back);
      this._inspectEl = back;
      const close = () => {
        if (!back.isConnected || back.classList.contains('oc-closing')) return;
        back.classList.add('oc-closing');
        setTimeout(() => back.remove(), 200);
        this._inspectEl = null;
        this._closeInspect = null;
        resolve();
      };
      this._closeInspect = close;
      back.addEventListener('click', close);
    });
  }

  get inspecting() { return !!this._inspectEl; }
  closeInspect() { this._closeInspect?.(); }
}
