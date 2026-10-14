// Dialogue box (typewriter + blips + queue), narrator captions, and two-option choices.
// Choices stand in a column ABOVE the box (out of the band where players click to advance) and ignore clicks for
// CHOICE_GRACE_MS after they appear, so a click meant for the line before never picks one.
const CHOICE_GRACE_MS = 300;

// Portraits: flat, warm, a dark outline. Mouth and eyelids are animated by CSS while a line types.
const TALLOW_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="tbg" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#3b3a46"/><stop offset="1" stop-color="#15131a"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#tbg)"/>
  <g stroke="#15110f" stroke-width="2" stroke-linejoin="round">
    <path d="M22 104 Q24 72 50 70 Q76 72 78 104 Z" fill="#2a2730"/>
    <path d="M38 78 L50 70 L62 78 L50 86 Z" fill="#d9d2c4"/>
    <path d="M30 28 Q30 10 50 10 Q70 10 70 28 L70 36 Q70 30 62 29 L38 29 Q30 30 30 36 Z" fill="#9b9a9c"/>
    <path d="M34 40 Q34 24 50 24 Q66 24 66 40 Q66 62 50 66 Q34 62 34 40 Z" fill="#e6d7c6"/>
    <ellipse cx="50" cy="12" rx="9" ry="6" fill="#9b9a9c"/>
  </g>
  <g fill="#1a1512"><ellipse cx="42" cy="42" rx="2.4" ry="3"/><ellipse cx="58" cy="42" rx="2.4" ry="3"/></g>
  <g class="oc-eyelid" fill="#e6d7c6"><rect x="37" y="36" width="10" height="7" rx="3"/><rect x="53" y="36" width="10" height="7" rx="3"/></g>
  <path d="M38 36 Q42 33 46 36 M54 36 Q58 33 62 36" fill="none" stroke="#5a4a3a" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M48 46 L50 52 L52 46" fill="none" stroke="#8a6a5a" stroke-width="1.2"/>
  <path class="oc-mouth" style="transform-origin:50px 58px" d="M44 58 Q50 59 56 58" fill="none" stroke="#5a2a2a" stroke-width="1.6" stroke-linecap="round"/>
  <g stroke="#c9a24a" stroke-width="1.4" fill="none"><circle cx="30" cy="88" r="4"/><path d="M30 92 L30 100 M27 97 L30 97"/></g>
</svg>`;
const FINCH_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="fbg" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#2b4a3a"/><stop offset="1" stop-color="#10201a"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#fbg)"/>
  <g stroke="#15110f" stroke-width="2" stroke-linejoin="round">
    <path d="M16 104 Q20 70 50 68 Q80 70 84 104 Z" fill="#6b5a3e"/>
    <path d="M30 76 Q50 66 70 76 L70 84 Q50 76 30 84 Z" fill="#8a2e2a"/>
    <path d="M33 42 Q33 24 50 24 Q67 24 67 42 Q67 64 50 68 Q33 64 33 42 Z" fill="#d8bfa2"/>
    <path d="M28 30 Q30 14 50 14 Q70 14 72 30 L74 33 L26 33 Z" fill="#3b3a46"/>
  </g>
  <g fill="#1a1512"><ellipse cx="42" cy="44" rx="2.2" ry="2.6"/><ellipse cx="58" cy="44" rx="2.2" ry="2.6"/></g>
  <g class="oc-eyelid" fill="#d8bfa2"><rect x="37" y="38" width="10" height="7" rx="3"/><rect x="53" y="38" width="10" height="7" rx="3"/></g>
  <path d="M37 39 Q42 37 47 39 M53 39 Q58 37 63 39" fill="none" stroke="#9a8a7a" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M48 48 L49 54 L52 48" fill="none" stroke="#9a7a6a" stroke-width="1.2"/>
  <path class="oc-mouth" style="transform-origin:50px 60px" d="M43 60 Q50 63 57 60" fill="none" stroke="#4a2a2a" stroke-width="1.8" stroke-linecap="round"/>
  <g fill="#f3ead8"><rect x="46" y="59" width="2" height="2"/><rect x="52" y="59" width="2" height="2"/></g>
  <g fill="#d9d2c4" opacity="0.8"><ellipse cx="22" cy="60" rx="3" ry="2" transform="rotate(-30 22 60)"/><ellipse cx="78" cy="52" rx="3" ry="2" transform="rotate(20 78 52)"/><ellipse cx="70" cy="90" rx="3" ry="2"/></g>
</svg>`;
const PELL_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="pbg" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#4a3a3a"/><stop offset="1" stop-color="#1a1212"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#pbg)"/>
  <g stroke="#15110f" stroke-width="2" stroke-linejoin="round">
    <path d="M24 104 Q26 72 50 70 Q74 72 76 104 Z" fill="#6d5a4a"/>
    <path d="M36 80 L50 72 L64 80 L64 104 L36 104 Z" fill="#e8e2d4"/>
    <path d="M30 34 Q30 14 50 14 Q70 14 70 34 L70 40 Q66 30 50 30 Q34 30 30 40 Z" fill="#8f8a84"/>
    <path d="M35 42 Q35 26 50 26 Q65 26 65 42 Q65 62 50 66 Q35 62 35 42 Z" fill="#e9dccb"/>
    <path d="M28 36 Q30 22 50 20 Q70 22 72 36 Q66 32 50 32 Q34 32 28 36 Z" fill="#8f8a84"/>
  </g>
  <g fill="#1a1512"><ellipse cx="43" cy="44" rx="2.2" ry="2.8"/><ellipse cx="57" cy="44" rx="2.2" ry="2.8"/></g>
  <g class="oc-eyelid" fill="#e9dccb"><rect x="38" y="38" width="10" height="7" rx="3"/><rect x="52" y="38" width="10" height="7" rx="3"/></g>
  <path d="M39 38 Q43 36 47 38 M53 38 Q57 36 61 38" fill="none" stroke="#6a5a4a" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M48 48 L50 53 L52 48" fill="none" stroke="#9a7a6a" stroke-width="1.2"/>
  <path class="oc-mouth" style="transform-origin:50px 59px" d="M45 59 Q50 61 55 59" fill="none" stroke="#7a3a3a" stroke-width="1.6" stroke-linecap="round"/>
  <g stroke="#c9a24a" stroke-width="1.2" fill="none"><rect x="42" y="86" width="16" height="9" rx="1"/></g>
</svg>`;
const WICK_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="wbg" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#3a4a3a"/><stop offset="1" stop-color="#121a12"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#wbg)"/>
  <g stroke="#15110f" stroke-width="2" stroke-linejoin="round">
    <path d="M22 104 Q24 72 50 70 Q76 72 78 104 Z" fill="#d9d2c4"/>
    <path d="M40 80 L50 72 L60 80 L54 104 L46 104 Z" fill="#3a2a22"/>
    <path d="M35 40 Q35 24 50 24 Q65 24 65 40 Q65 62 50 66 Q35 62 35 40 Z" fill="#dcc3a6"/>
    <path d="M33 34 Q35 18 50 18 Q65 18 67 34 Q60 28 50 28 Q40 28 33 34 Z" fill="#b8b2a6"/>
  </g>
  <g fill="#1a1512"><ellipse cx="43" cy="44" rx="2.2" ry="2.8"/><ellipse cx="57" cy="44" rx="2.2" ry="2.8"/></g>
  <g class="oc-eyelid" fill="#dcc3a6"><rect x="38" y="38" width="10" height="7" rx="3"/><rect x="52" y="38" width="10" height="7" rx="3"/></g>
  <g fill="none" stroke="#6a5a4a" stroke-width="1.2"><circle cx="43" cy="44" r="5"/><circle cx="57" cy="44" r="5"/><path d="M48 44 L52 44"/></g>
  <path d="M48 48 L50 53 L52 48" fill="none" stroke="#9a7a6a" stroke-width="1.2"/>
  <path class="oc-mouth" style="transform-origin:50px 59px" d="M45 59 Q50 59 55 59" fill="none" stroke="#5a2a2a" stroke-width="1.6" stroke-linecap="round"/>
  <g fill="#f3ead8"><rect x="45" y="58" width="2" height="2"/><rect x="48" y="58" width="2" height="2"/><rect x="51" y="58" width="2" height="2"/><rect x="54" y="58" width="2" height="2"/></g>
</svg>`;
const PORTRAITS = { tallow: TALLOW_SVG, finch: FINCH_SVG, pell: PELL_SVG, wick: WICK_SVG };

const SPEAKERS = {
  tallow: { name: 'Mrs. Tallow', pitch: 0.9, portrait: true, blip: true },
  finch: { name: 'Mr. Finch', pitch: 0.6, portrait: true, blip: true },
  pell: { name: 'Miss Pell', pitch: 1.15, portrait: true, blip: true },
  wick: { name: 'Mr. Wick', pitch: 0.8, portrait: true, blip: true },
  narrator: { name: '', pitch: 1, portrait: false, blip: false },
};

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** Parse *emphasis* into tokens [{ch, em}]. */
function tokenize(text) {
  const out = [];
  let em = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '*') { em = !em; continue; }
    out.push({ ch, em });
  }
  return out;
}
function tokensToHtml(tokens, n) {
  let html = '', em = false;
  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    if (t.em !== em) { html += t.em ? '<em>' : '</em>'; em = t.em; }
    html += escapeHtml(t.ch);
  }
  if (em) html += '</em>';
  return html;
}

export class Dialogue {
  constructor(ctx) {
    this.ctx = ctx;
    this.cps = 42;            // characters per second
    this.isOpen = false;      // true while a blocking line/choice is on screen
    this._queue = Promise.resolve();
    this._pending = 0;
    this._line = null;        // { tokens, shown, done, resolve }
    this.closedAt = -1e9;     // performance.now() when the box last closed or a choice was taken (Interaction's grace)
    this.openedAt = -1e9;     // performance.now() when the box last opened
    this.advancedAt = -1e9;   // performance.now() when a line was last dismissed

    // its own layer on body: above the fade (a line can be said over black), below the end card; see ui.css
    const layer = document.createElement('div');
    layer.className = 'oc-dialogue-layer';
    document.body.appendChild(layer);
    this.layer = layer;

    const el = document.createElement('div');
    el.className = 'oc-dialog oc-hidden';
    el.innerHTML = `
      <div class="oc-portrait"></div>
      <div class="oc-dialog-body">
        <div class="oc-speaker"></div>
        <div class="oc-text"></div>
        <div class="oc-choices"></div>
      </div>
      <div class="oc-next"></div>`;
    layer.appendChild(el);
    this.el = el;
    this.portraitEl = el.querySelector('.oc-portrait');
    this.speakerEl = el.querySelector('.oc-speaker');
    this.textEl = el.querySelector('.oc-text');
    this.choicesEl = el.querySelector('.oc-choices');
    el.addEventListener('click', (e) => { if (!e.target.closest('.oc-choice')) this.advance(); });

    this.captionEl = document.createElement('div');
    this.captionEl.className = 'oc-caption oc-hidden';
    layer.appendChild(this.captionEl);
    this._captionTimer = null;
    // a click ON a caption dismisses it and goes no further (players click captions away; it must not hit the scene
    // under it). The press never reaches the canvas, so Interaction never sees it. Clicks elsewhere are untouched.
    const swallow = (e) => { e.stopPropagation(); };
    this.captionEl.addEventListener('pointerdown', (e) => { swallow(e); if (e.button === 0) this.hideCaption(); });
    this.captionEl.addEventListener('click', swallow);

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.advance(); }
    });
  }

  // ---- content resolution ---------------------------------------------------
  /** Merge extra keys into the script (existing keys are NOT overwritten unless overwrite=true). */
  addScript(entries, { overwrite = false } = {}) {
    const s = this.ctx.script;
    for (const [k, v] of Object.entries(entries)) if (overwrite || !(k in s)) s[k] = v;
  }

  has(key) { return !!this.ctx.script && key in this.ctx.script; }

  /**
   * Normalise a key or raw content into an array of {who, text}.
   * - string key → script lookup; unknown string → narrator line with that text
   * - script string → narrator line; array of strings → random one; array of line-arrays → random one
   */
  resolve(keyOrLines) {
    let v = keyOrLines;
    if (typeof v === 'string') {
      if (this.ctx.script && v in this.ctx.script) v = this.ctx.script[v];
      else if (/^[\w.-]+$/.test(v) && v.includes('.')) {
        console.warn(`[dialogue] missing script key "${v}"`);
        return [];
      }
    }
    if (v == null) return [];
    if (typeof v === 'string') return [{ who: 'narrator', text: v }];
    if (Array.isArray(v)) {
      if (v.length === 0) return [];
      if (typeof v[0] === 'string') return [{ who: 'narrator', text: v[Math.floor(Math.random() * v.length)] }];
      if (Array.isArray(v[0])) return this.resolve(v[Math.floor(Math.random() * v.length)]);
      return v.map((l) => (typeof l === 'string' ? { who: 'narrator', text: l } : l));
    }
    if (typeof v === 'object' && v.text) return [v];
    return [];
  }

  // ---- public API -------------------------------------------------------------
  /** Say a script key (or raw lines). Calls serialize. Resolves after the last line is dismissed. */
  say(keyOrLines) {
    const lines = this._nightVariant(keyOrLines, this.resolve(keyOrLines));
    return this._enqueue(() => this._playLines(lines));
  }

  sayLines(lines) { return this.say(lines); }

  /**
   * Night 2 and after (the memorial has a plate): '<key>.night2.<last ending>', else '<key>.night2', replaces the FIRST
   * line of a plain line-array key. Nothing changes on night 1 or for keys without a variant.
   */
  _nightVariant(key, lines) {
    if (typeof key !== 'string' || !lines.length || !this.ctx.script) return lines;
    const last = this.ctx.memorial?.last;
    if (!last) return lines;
    const v = this.ctx.script[`${key}.night2.${last.ending}`] ?? this.ctx.script[`${key}.night2`];
    if (!v) return lines;
    const first = this.resolve(v);
    return first.length ? [...first, ...lines.slice(1)] : lines;
  }

  /**
   * Two-option choice. Resolves with the chosen index (0/1) after the reply is played. `onPick(idx)` runs the moment an
   * option is taken, before the reply (do the state change there so the HUD moves with the click, not after the reply).
   */
  choice(keyOrDef, { onPick } = {}) {
    const def = typeof keyOrDef === 'string' ? this.ctx.script?.[keyOrDef] : keyOrDef;
    if (!def) { console.warn(`[dialogue] missing choice "${keyOrDef}"`); return Promise.resolve(-1); }
    return this._enqueue(async () => {
      const prompt = this.resolve(def.prompt || []);
      for (let i = 0; i < prompt.length - 1; i++) await this._showLine(prompt[i]);
      const last = prompt[prompt.length - 1] || { who: 'narrator', text: '' };
      const idx = await this._showLine(last, def.options || []);
      if (onPick) { try { await onPick(idx); } catch (e) { console.error(e); } }
      const reply = this.resolve(def.options?.[idx]?.reply || []);
      await this._playLines(reply, true);
      return idx;
    });
  }

  /** Narrator caption: non-blocking, auto-dismisses. Accepts a script key or text. */
  caption(keyOrText, { duration, scope, top = false } = {}) {
    // `top`: sit under the HUD instead of above the inventory (a close-up whose working parts are low in the frame)
    // `scope`: only show if the hotspot scope is still this one (a caption that arrives after the player has left the
    // close-up is dropped). Captions shown in a close-up are hidden when the scope changes (Interaction calls _scopeChanged).
    const cur = this.ctx.hotspots?.scope;
    if (scope && cur !== scope) return;
    let text = keyOrText;
    if (typeof keyOrText === 'string' && this.ctx.script && keyOrText in this.ctx.script) {
      const lines = this.resolve(keyOrText);
      text = lines.map((l) => l.text).join(' ');
    } else if (Array.isArray(keyOrText)) {
      text = keyOrText[Math.floor(Math.random() * keyOrText.length)];
    }
    if (!text) return;
    this._captionScope = cur ?? null;
    const el = this.captionEl;
    el.innerHTML = tokensToHtml(tokenize(text), tokenize(text).length);
    el.classList.toggle('oc-caption-top', !!top);
    el.classList.remove('oc-hidden');
    clearTimeout(this._captionTimer);
    const ms = (duration ?? Math.max(2.5, text.split(/\s+/).length * 0.32 + 1)) * 1000;
    clearTimeout(this._captionClear);
    this._captionTimer = setTimeout(() => this._hideCaptionEl(), ms);
  }

  hideCaption() { clearTimeout(this._captionTimer); this._hideCaptionEl(); }
  /** Hide the caption and, once it has faded, take its text out of the DOM (no stale line for a reader to find). */
  _hideCaptionEl() {
    const el = this.captionEl;
    el.classList.add('oc-hidden');
    clearTimeout(this._captionClear);
    this._captionClear = setTimeout(() => { if (el.classList.contains('oc-hidden')) el.textContent = ''; }, 400);
  }
  /** Interaction calls this when the hotspot scope changes: a caption that belonged to a close-up goes with it. */
  _scopeChanged(next) {
    if (this._captionScope && this._captionScope !== 'room' && this._captionScope !== next) this.hideCaption();
  }

  /** Complete the current typewriter line, or advance if already complete. */
  advance() {
    const l = this._line;
    if (!l || l.choices) return;
    if (!l.done) { l.shown = l.tokens.length; this._renderLine(); return; }
    this.advancedAt = performance.now();
    this._line = null;
    l.resolve(0);
  }
  /** Esc: close the line on screen at once (typing or not). A choice is never dismissed. Returns true if a line closed. */
  dismiss() {
    const l = this._line;
    if (!l || l.choices) return false;
    if (!l.done) { l.shown = l.tokens.length; this._renderLine(); }
    this.advance();
    return true;
  }
  /** A choice is on screen (its buttons are, or will be once the prompt has typed). */
  get choosing() { return !!this._line?.choices; }
  skip() { this.advance(); }

  /** Is anything queued or showing? */
  get busy() { return this._pending > 0; }

  // ---- internals -------------------------------------------------------------
  _enqueue(fn) {
    this._pending++;
    const p = this._queue.then(fn).catch((e) => { console.error(e); }).finally(() => {
      this._pending--;
      if (this._pending === 0) this._close();
    });
    this._queue = p;
    return p;
  }

  async _playLines(lines, keepOpen = false) {
    for (const l of lines) await this._showLine(l);
  }

  _close() {
    if (this.isOpen) {
      this.closedAt = performance.now();
      // where the box stood: Interaction keeps it blocking the scene under it for a moment (no click-through)
      const r = this.el.getBoundingClientRect();
      this.lastRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    this.isOpen = false;
    this.el.classList.add('oc-hidden');
    this.portraitEl.classList.remove('oc-talk');
    // once it has faded, the box keeps no stale text in the DOM
    // (cleared when the fade really ends, not on a timer: a throttled tab can stall the
    // transition, and clearing early showed an empty parchment box for a beat)
    clearTimeout(this._clearTimer);
    const el = this.el;
    const clear = () => {
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(this._clearTimer);
      if (this.isOpen) return;
      this.textEl.textContent = ''; this.speakerEl.textContent = ''; this.choicesEl.innerHTML = '';
    };
    const onEnd = (e) => { if (e.target === el && e.propertyName === 'opacity') clear(); };
    el.removeEventListener('transitionend', this._onFadeEnd || (() => {}));
    this._onFadeEnd = onEnd;
    el.addEventListener('transitionend', onEnd);
    this._clearTimer = setTimeout(clear, 1500);
  }

  _showLine(line, choices = null) {
    const who = line.who || 'narrator';
    const sp = SPEAKERS[who] || { name: who, pitch: 1, portrait: false, blip: true };
    if (!this.isOpen) this.openedAt = performance.now();
    this.isOpen = true;
    this.hideCaption();
    const el = this.el;
    el.classList.remove('oc-hidden', 'oc-done');
    el.classList.toggle('oc-narrator', who === 'narrator');
    this.portraitEl.style.display = sp.portrait ? '' : 'none';
    if (sp.portrait && this._portraitWho !== who) { this.portraitEl.innerHTML = PORTRAITS[who] || ''; this._portraitWho = who; }
    this.speakerEl.textContent = sp.name;
    this.speakerEl.style.display = sp.name ? '' : 'none';
    this.choicesEl.innerHTML = '';
    const tokens = tokenize(String(line.text ?? ''));
    return new Promise((resolve) => {
      // a line usually starts from a tween's promise, between frames: its first letter goes up now, not on the next
      // frame (a throttled pane can leave that a second away: playtest saw an empty box ~1 s after the parlour lock),
      // and the typewriter runs on the wall clock (update), so a slow frame catches up instead of crawling
      this._line = { tokens, shown: Math.min(1, tokens.length), acc: 0, done: false, resolve, sp, choices, blipAcc: 0, startedAt: performance.now() };
      this._renderLine();
      this.ctx.game?.kick?.();
    });
  }

  _renderLine() {
    const l = this._line;
    if (!l) return;
    this.textEl.innerHTML = tokensToHtml(l.tokens, l.shown);
    if (l.shown >= l.tokens.length && !l.done) {
      l.done = true;
      this.el.classList.add('oc-done');
      this.portraitEl.classList.remove('oc-talk');
      if (l.choices && l.choices.length) {
        this.el.classList.remove('oc-done');
        const shownAt = performance.now();
        this.choicesEl.classList.add('oc-choices-wait');
        setTimeout(() => this.choicesEl.classList.remove('oc-choices-wait'), CHOICE_GRACE_MS);
        l.choices.forEach((opt, i) => {
          const b = document.createElement('button');
          b.className = 'oc-choice';
          b.type = 'button';
          b.textContent = opt.text;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._line !== l || performance.now() - shownAt < CHOICE_GRACE_MS) return; // a click meant for the line before
            this.ctx.audio?.play('click');
            this.closedAt = performance.now();
            this._line = null;
            this.choicesEl.innerHTML = '';
            l.resolve(i);
          });
          this.choicesEl.appendChild(b);
        });
      }
    }
  }

  /** Called by Game every frame. */
  update(dt) {
    const l = this._line;
    if (!l || l.done) return;
    const before = l.shown;
    // wall-clock typing: where the line should be by now (one letter shows at once), whatever the frame rate did
    const due = 1 + Math.floor(((performance.now() - (l.startedAt ?? performance.now())) / 1000) * this.cps);
    const add = due - l.shown;
    if (add > 0) {
      l.shown = Math.min(l.tokens.length, due);
      if (l.sp.blip) {
        this.portraitEl.classList.add('oc-talk');
        // after a slow frame, blip only the last few letters (not a burst of every letter missed)
        for (let i = Math.max(before, l.shown - 4); i < l.shown; i++) {
          const ch = l.tokens[i].ch;
          if (/[\s.,!?…—-]/.test(ch)) continue;
          if (++l.blipAcc % 2 === 0) {
            const jitter = 1 + (Math.random() - 0.5) * 0.12;
            this.ctx.audio?.blip(l.sp.pitch * jitter, { who: this._lineWho(l) });
          }
        }
      }
      this._renderLine();
    }
  }

  _lineWho(l) {
    for (const k in SPEAKERS) if (SPEAKERS[k] === l.sp) return k;
    return 'neutral';
  }
}
