// Full-screen fade overlay helpers. All return Promises.
//   await transitions.fadeOut()          // to black (0.6 s)
//   await transitions.fadeIn()           // from whatever colour is showing
//   await transitions.whiteOut(1.2)      // to white (ending flash)
//   await transitions.flash('#bfe3ff', 0.35)  // quick flash in & out (zaps)

export class Transitions {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'oc-fade';
    document.body.appendChild(this.el);
    this._anim = null;
    this.opacity = 0;
  }

  _to(opacity, duration, color) {
    if (color) this.el.style.background = color;
    const from = parseFloat(getComputedStyle(this.el).opacity) || 0;
    this._anim?.cancel();
    this.el.style.opacity = String(from);
    const a = this.el.animate([{ opacity: from }, { opacity }], { duration: duration * 1000, easing: 'ease-in-out', fill: 'forwards' });
    this._anim = a;
    this.opacity = opacity;
    return new Promise((res) => {
      // a hidden tab may never deliver `finish`; the timer settles the fade so room transitions cannot hang on it
      let done = false;
      const settle = (finished) => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (finished) this.el.style.opacity = String(opacity);
        res();
      };
      a.onfinish = () => settle(true);
      a.oncancel = () => settle(false);
      const timer = setTimeout(() => { if (done) return; try { a.finish(); } catch (e) { /* ignore */ } settle(true); }, duration * 1000 + 500);
    });
  }

  fadeOut(duration = 0.6, color = '#000') { return this._to(1, duration, color); }
  fadeIn(duration = 0.6) { return this._to(0, duration); }
  whiteOut(duration = 1.2) { return this._to(1, duration, '#fffaf0'); }
  /** Cover instantly with `color`, then fade it away (e.g. the ending fades in from the ritual's white). ADDED BY ending agent. */
  fadeFrom(color = '#fffaf0', duration = 1.2) { this.cover(color); return this._to(0, duration); }

  /** Set fully covered instantly (e.g. before first room loads). */
  cover(color = '#000') { this._anim?.cancel(); this.el.style.background = color; this.el.style.opacity = '1'; this.opacity = 1; }

  async flash(color = '#ffffff', duration = 0.35, peak = 0.85) {
    await this._to(peak, duration * 0.3, color);
    await this._to(0, duration * 0.7);
  }
}
