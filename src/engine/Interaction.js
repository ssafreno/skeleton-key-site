import * as THREE from 'three';

const HIGHLIGHT = new THREE.Color(0xffd2a0);
const TINT = new THREE.Color(1.0, 0.93, 0.82);
const _c = new THREE.Color();
const DRAG_THRESHOLD = 6; // px before a press becomes a drag (and never a click)
const CLICK_HOLD_MS = 320; // a press held longer than this is not a click (a slow look, a hesitation), whatever it moved
const BOX_GRACE_MS = 450;  // after the dialogue box closes, a press inside where it stood still belongs to it (click-through)

/**
 * Hotspots: raycast targets with hover highlight, cursor label, scoped click dispatch and item use.
 * See docs/ENGINE_API.md for the full spec.
 */
export class Interaction {
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
    this._scope = 'room';
    this._needMove = false;   // after a view change, no hover/label until the pointer moves again
    this.enabled = true;      // master switch (title screen / cutscenes)
    this._locks = 0;
    this._map = new Map();    // id → hotspot
    this._byObject = new Map(); // object.uuid → [hotspot]
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-10, -10);
    this._hasPointer = false;
    this.hovered = null;
    this._swapped = new Map(); // mesh → original material (while highlighted)
    this._clones = new WeakMap();
    this._press = null;
    // polish: was 1.1 (albedo x2.1 washed big props like the room1 desk to white). One gentle level for every hotspot.
    this.highlightStrength = 0.38; // hovered albedo is multiplied by ~(1 + this)
    this.highlightGlow = 0.02;     // plus this much flat warm emissive (kept low: it washes shadowed faces grey)
    this.clickCount = 0;       // clicks on hotspots since last room enter (Hints uses it)

    // cursor label
    this.label = document.createElement('div');
    this.label.className = 'oc-cursor-label';
    this.label.hidden = true;
    ctx.ui.appendChild(this.label);

    canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    canvas.addEventListener('pointerleave', () => {
      this._hasPointer = false;
      if (!this._press) { this._setHover(null); this.label.hidden = true; document.body.classList.remove('oc-hovering'); }
    });
    // a press the browser takes back (a system gesture, a lost capture) is neither a click nor a drag
    window.addEventListener('pointercancel', () => { this._press = null; document.body.classList.remove('oc-dragging'); });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.ctx.inventory?.selected) this.ctx.inventory.deselect();
    });
  }

  /** Hotspot scope ('room' | 'focus:<name>'). Changing it (focus / back / room change) drops any hover label. */
  get scope() { return this._scope; }
  set scope(v) {
    if (v === this._scope) return;
    this._scope = v;
    this.clearHover();
    this.ctx.dialogue?._scopeChanged?.(v);
  }

  /** Drop the hover glow and cursor label; nothing hovers again until the pointer moves. */
  clearHover() {
    this._setHover(null);
    this.label.hidden = true;
    document.body.classList.remove('oc-hovering');
    this._needMove = true;
  }

  /** Disable all interaction until a matching unlock(). Nestable. */
  lock() { this._locks++; this._setHover(null); }
  unlock() { this._locks = Math.max(0, this._locks - 1); }
  get locked() { return this._locks > 0 || !this.enabled; }

  /**
   * Register a hotspot. Re-adding an existing id replaces it.
   * @returns the hotspot record
   */
  add(spec) {
    if (!spec || !spec.id || !spec.object) throw new Error('hotspots.add needs { id, object }');
    if (this._map.has(spec.id)) this.remove(spec.id);
    const h = {
      scope: 'room',
      highlight: true,
      enabledFlag: true,
      ...spec,
    };
    this._map.set(h.id, h);
    const list = this._byObject.get(h.object.uuid) || [];
    list.push(h);
    this._byObject.set(h.object.uuid, list);
    return h;
  }

  remove(id) {
    const h = this._map.get(id);
    if (!h) return;
    if (this.hovered === h) this._setHover(null);
    this._map.delete(id);
    const list = (this._byObject.get(h.object.uuid) || []).filter((x) => x !== h);
    if (list.length) this._byObject.set(h.object.uuid, list); else this._byObject.delete(h.object.uuid);
  }

  get(id) { return this._map.get(id) || null; }
  has(id) { return this._map.has(id); }
  setEnabled(id, b) { const h = this._map.get(id); if (h) { h.enabledFlag = !!b; if (!b && this.hovered === h) this._setHover(null); } }
  /** Merge fields into an existing hotspot (e.g. add useItem handlers to the cat). */
  update(id, patch) { const h = this._map.get(id); if (h) Object.assign(h, patch); return h; }

  /** Invisible box mesh to use as a generous click target. Add it to your group and pass it as `object`. */
  proxyBox(w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.userData.hitProxy = true;
    return m;
  }

  _scopeMatches(h) {
    const s = h.scope;
    if (s === 'any') return true;
    if (Array.isArray(s)) return s.includes(this.scope);
    return s === this.scope;
  }

  _isActive(h) {
    if (!h.enabledFlag) return false;
    if (!this._scopeMatches(h)) return false;
    if (h.enabled) { try { if (!h.enabled()) return false; } catch (e) { console.error(e); return false; } }
    return true;
  }

  _visibleChain(obj) {
    // object must be visible (hit proxies may use an invisible *material*, but obj.visible must be true)
    let o = obj;
    while (o) { if (!o.visible) return false; o = o.parent; }
    return true;
  }

  /** Returns { hotspot, hit } under the given NDC (or current pointer), or null. */
  pick(ndc = this.pointer) {
    const root = this.ctx.game?.currentRoom?.group;
    if (!root) return null;
    const cam = this.ctx.camera.camera;
    cam.updateMatrixWorld(); // the camera may have moved since the last render (damping, a lookAtPoint, a tween)
    this.raycaster.setFromCamera(ndc, cam);
    const hits = this.raycaster.intersectObject(root, true);
    for (const hit of hits) {
      const o = hit.object;
      if (o.userData.noRaycast) continue;
      if (!this._visibleChain(o)) continue;
      // first visible thing along the ray decides (occlusion). Walk up to find the most specific active hotspot.
      let n = o;
      while (n) {
        const list = this._byObject.get(n.uuid);
        if (list) {
          for (let i = list.length - 1; i >= 0; i--) if (this._isActive(list[i])) return { hotspot: list[i], hit };
        }
        n = n.parent;
      }
      // invisible-material proxies that aren't active hotspots should not block
      if (o.material && o.material.visible === false) continue;
      return null;
    }
    return null;
  }

  _ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _onDown(e) {
    if (e.button !== 0) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointer.copy(this._ndc(e));
    this._lastClient = { x: e.clientX, y: e.clientY };
    const dlg = this.ctx.dialogue;
    const at = performance.now();
    // the press began while a line was on screen: it belongs to the dialogue, never to a hotspot. A press that begins
    // after the line closed is a fresh click (no blanket grace), unless it lands where the box just stood.
    const talking = !!dlg?.isOpen;
    const shielded = !talking && this._overClosedBox(e, at);
    const picked = !this.locked && !talking && !shielded ? this.pick() : null;
    this._press = {
      x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, at,
      talking, shielded,
      dragging: false, picked,
      dragHotspot: picked && picked.hotspot.onDrag ? picked.hotspot : null,
    };
    if (this._press.dragHotspot) {
      this._press.dragging = true;
      this._callSafe(this._press.dragHotspot.onDragStart, this._dragInfo(e, picked.hit));
    }
  }

  _dragInfo(e, hit) {
    const ndc = this._ndc(e);
    this.raycaster.setFromCamera(ndc, this.ctx.camera.camera);
    const p = this._press || {};
    return {
      x: e.clientX, y: e.clientY, ndc,
      dx: e.clientX - (p.lastX ?? e.clientX), dy: e.clientY - (p.lastY ?? e.clientY),
      totalDx: e.clientX - (p.x ?? e.clientX), totalDy: e.clientY - (p.y ?? e.clientY),
      ray: this.raycaster.ray.clone(),
      point: hit?.point || null,
      event: e,
    };
  }

  _onMove(e) {
    const ndc = this._ndc(e);
    this.pointer.copy(ndc);
    this._hasPointer = e.target === this.canvas || this._press;
    this._lastClient = { x: e.clientX, y: e.clientY };
    if (!(this._hasPointer)) { if (this.hovered) this._setHover(null); this.label.hidden = true; document.body.classList.remove('oc-hovering'); }
    this._needMove = false;
    const p = this._press;
    if (p) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.dragHotspot) {
        this._callSafe(p.dragHotspot.onDrag, this._dragInfo(e));
      } else {
        if (!p.dragging && dist > DRAG_THRESHOLD) {
          p.dragging = true;
          document.body.classList.add('oc-dragging');
          // a look-drag moves the world under the label: drop it now, it comes back from a fresh raycast on release
          this._setHover(null);
          this.label.hidden = true;
          document.body.classList.remove('oc-hovering');
        }
        if (p.dragging && !this.locked) this.ctx.camera.dragBy(e.clientX - p.lastX, e.clientY - p.lastY);
      }
      p.lastX = e.clientX; p.lastY = e.clientY;
    }
    this._positionLabel();
  }

  _onUp(e) {
    const p = this._press;
    if (!p || e.button !== 0) return;
    this._press = null;
    document.body.classList.remove('oc-dragging');
    // A release only counts as a click if the pointer stayed put: never after a look-drag, even when
    // no pointermove arrived in between (synthetic/coalesced input), and never far from the press point.
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD
      || Math.hypot(p.lastX - p.x, p.lastY - p.y) > DRAG_THRESHOLD;
    const held = performance.now() - p.at > CLICK_HOLD_MS;
    if (p.dragHotspot) {
      this._callSafe(p.dragHotspot.onDragEnd, this._dragInfo(e));
      if (moved || held) { this._rehover(e); return; }
    } else if (p.dragging || moved) { this._rehover(e); return; }
    // held too long: not a click (a line on screen still advances: that press was only ever the dialogue's)
    if (held && !(p.talking && this.ctx.dialogue?.isOpen)) return;
    if (e.target !== this.canvas && !this.canvas.contains(e.target)) return;
    this._lastPress = p;
    try { this._click(e); } finally { this._lastPress = null; this.ctx.game?.kick?.(); }
  }

  /**
   * A drag just ended: the world moved under the pointer, so whatever was hovered before (or nothing) is stale. Raycast
   * again now from where the pointer is, rather than waiting for the next frame or move to correct the label.
   */
  _rehover(e) {
    this.pointer.copy(this._ndc(e));
    this._lastClient = { x: e.clientX, y: e.clientY };
    this._needMove = false;
    const r = this.canvas.getBoundingClientRect();
    this._hasPointer = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const blocked = this.locked || this.ctx.dialogue?.isOpen || !this._hasPointer || this.ctx.camera?.mode === 'tween';
    const picked = blocked ? null : this.pick();
    this._setHover(picked ? picked.hotspot : null);
    if (!this.hovered) { this.label.hidden = true; document.body.classList.remove('oc-hovering'); }
    this.ctx.game?.kick?.();
  }

  _callSafe(fn, arg) {
    if (!fn) return undefined;
    try { return fn(arg); } catch (err) { console.error('[hotspot]', err); return undefined; }
  }

  /** The dialogue box closed a moment ago and this press is where it stood: it still blocks what is under it. */
  _overClosedBox(e, now = performance.now()) {
    const d = this.ctx.dialogue;
    const r = d?.lastRect;
    if (!r || now - (d.closedAt ?? -1e9) > BOX_GRACE_MS) return false;
    const pad = 8;
    return e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad;
  }
  /** Kept for callers: true while a press would still be the dialogue's (a line is open). */
  _inGrace() { return !!this.ctx.dialogue?.isOpen; }

  _click(e) {
    const ctx = this.ctx;
    const p = this._lastPress;
    if (ctx.dialogue?.isOpen) {
      // advance only a line that was already on screen when the press began (a line that arrived mid-press is not skipped)
      if (!p || p.at >= (ctx.dialogue.openedAt ?? 0) || p.talking) ctx.dialogue.advance();
      return;
    }
    // the press that dismissed the last line (it began while the line was up) is consumed; so is one where the box
    // just stood. A press that began after the line closed is a fresh click and goes through.
    if (p && (p.talking || p.shielded || p.at < (ctx.dialogue?.closedAt ?? -1e9))) return;
    if (this.locked) return;
    this.pointer.copy(this._ndc(e));
    const picked = this.pick();
    const item = ctx.inventory?.selected || null;
    if (!picked) {
      // an item on nothing in particular: the house says so, and the item stays in your hand (right-click / Esc drop it)
      if (item) this._nopeItem();
      return;
    }
    const h = picked.hotspot;
    const info = { item, point: picked.hit.point, hit: picked.hit, event: e, hotspot: h };
    this.clickCount++;
    ctx.hints?.noteClick?.(h.id);
    if (ctx.game?.dev) console.log(`[hotspot] click "${h.id}"`, item ? `with item "${item}"` : '', `scope=${this.scope}`);

    if (item) {
      const handler = h.useItem && (h.useItem[item] || h.useItem['*']);
      if (handler) {
        const r = this._callSafe(handler, info);
        if (r !== false && ctx.inventory.selected === item) ctx.inventory.deselect();
        return;
      }
      if (h.acceptsAnyItem && h.onClick) { this._callSafe(h.onClick, info); return; }
      // unhandled item use: a line from the house, and the item stays selected
      this._nopeItem();
      return;
    }
    ctx.audio?.play('click', { gain: 0.5 });
    this._callSafe(h.onClick, info);
  }

  /** An item used where it has no use: one of `caption.nope.item` (falls back to `caption.nope`); the selection is kept. */
  _nopeItem() {
    const ctx = this.ctx;
    ctx.audio?.play('error', { gain: 0.35 });
    const key = ctx.script?.['caption.nope.item'] ? 'caption.nope.item' : ctx.script?.['caption.nope'] ? 'caption.nope' : null;
    ctx.dialogue?.caption(key || 'Not there.', { duration: 2.2 });
  }

  _setHover(h) {
    if (this.hovered === h) return;
    const prev = this.hovered;
    this.hovered = h;
    if (prev) { this._unhighlight(); this._callSafe(prev.onHover, false); }
    if (h) {
      if (h.highlight !== false) this._highlight(h);
      this._callSafe(h.onHover, true);
      this.ctx.audio?.play('hover', { gain: 0.15 });
    }
    this._updateLabel();
  }

  _labelText(h) {
    if (!h) return '';
    let txt = typeof h.label === 'function' ? h.label() : h.label || '';
    const item = this.ctx.inventory?.selected;
    if (item) {
      const name = this.ctx.items?.[item]?.name || item;
      txt = txt ? `Use ${name} on ${txt}` : `Use ${name}`;
    }
    return txt;
  }

  _updateLabel() {
    const txt = this._labelText(this.hovered);
    if (!txt) { this.label.hidden = true; document.body.classList.remove('oc-hovering'); return; }
    this.label.textContent = txt;
    this.label.hidden = false;
    document.body.classList.add('oc-hovering');
    this._positionLabel();
  }

  _positionLabel() {
    if (!this._lastClient) return;
    const { x, y } = this._lastClient;
    const w = this.label.offsetWidth;
    const left = Math.min(window.innerWidth - w - 8, x + 18);
    this.label.style.transform = `translate(${left}px, ${y + 20}px)`;
  }

  _hlClone(orig) {
    if (!orig || orig.visible === false || orig.isShaderMaterial || orig.userData.noHighlight) return orig;
    let clone = this._clones.get(orig);
    if (!clone) {
      clone = orig.clone();
      this._clones.set(orig, clone);
    } else clone.copy(orig);
    clone.userData.__hl = true;
    clone.userData.__baseEmissive = clone.emissive ? clone.emissive.clone() : null;
    clone.userData.__baseColor = clone.color ? clone.color.clone() : null;
    clone.userData.__baseIntensity = clone.emissiveIntensity ?? 1;
    clone.userData.__ownEmissiveMap = !!orig.emissiveMap;
    return clone;
  }

  _highlight(h) {
    // `highlight: someObject3D` glows that object instead of `object` (proxy-box hotspots rely on this)
    const target = h.highlight && h.highlight.isObject3D ? h.highlight : h.object;
    target.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.material || o.userData.noHighlight) return;
      const orig = o.material;
      const next = Array.isArray(orig) ? orig.map((m) => this._hlClone(m)) : this._hlClone(orig);
      if (next === orig) return;
      this._swapped.set(o, orig);
      o.material = next;
    });
  }

  _unhighlight() {
    for (const [mesh, orig] of this._swapped) mesh.material = orig;
    this._swapped.clear();
  }

  _pulse(t) {
    if (!this._swapped.size) return;
    const k = 0.75 + 0.25 * Math.sin(t * 4);
    const lift = 1 + this.highlightStrength * k;
    for (const [mesh] of this._swapped) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m.userData.__hl) continue;
        const ud = m.userData;
        // Brighten the surface's own albedo (keeps textures & vertex colours), warm-tinted,
        // plus a faint warm emissive so very dark objects still read.
        if (m.color && ud.__baseColor) m.color.copy(ud.__baseColor).multiply(TINT).multiplyScalar(lift);
        if (m.emissive && ud.__baseEmissive) {
          if (ud.__ownEmissiveMap) m.emissiveIntensity = ud.__baseIntensity * (1 + 0.35 * k);
          else m.emissive.copy(ud.__baseEmissive).add(_c.copy(HIGHLIGHT).multiplyScalar(this.highlightGlow * k));
        }
      }
    }
  }

  /** Called by Game each frame. */
  update(dt, t) {
    // every frame re-picks from the camera as it is NOW (pick() refreshes its matrix), so a view that moved under a
    // still pointer (a lookAtPoint, damping after a drag, a tween ending) never keeps the old target's label
    if (this.locked || this.ctx.dialogue?.isOpen || !this._hasPointer || this._needMove || this.ctx.camera?.mode === 'tween' || (this._press && this._press.dragging && !this._press.dragHotspot)) {
      if (this.hovered && !(this._press && this._press.dragHotspot)) this._setHover(null);
    } else if (!this._press || !this._press.dragHotspot) {
      const picked = this.pick();
      this._setHover(picked ? picked.hotspot : null);
    }
    if (this.hovered) this._updateLabelIfDynamic();
    this._pulse(t);
  }

  _updateLabelIfDynamic() {
    const txt = this._labelText(this.hovered);
    if (txt !== this.label.textContent) this._updateLabel();
  }

  /** Called on room change. */
  resetForRoom() {
    this.clearHover();
    this.clickCount = 0;
    this._press = null;
    document.body.classList.remove('oc-dragging');
  }
}
