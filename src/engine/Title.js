// Title screen overlay. The 3D background (a slowly panning room) is managed by Game.showTitle().
import { ENDING_NAMES } from '../logic/house.js';
import { SLOT } from './storage.js';

export class Title {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = null;
  }

  /** Show the overlay. Resolves with 'new' | 'continue'. */
  show({ canContinue = false, night = 1 } = {}) {
    const el = document.createElement('div');
    el.className = 'oc-title';
    // the last plate on the wall: how the last night ended, and the hall clock when it did (not the time played)
    const last = this.ctx.memorial?.last;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const bestTxt = last ? `Last night · ${esc(ENDING_NAMES[last.ending] || last.ending)} · ${esc(last.clock || '12:00')} · ` : '';
    el.innerHTML = `
      <div class="oc-title-kicker">A Halloween call-out · Night ${night}</div>
      <h1>Skeleton <em>Key</em></h1>
      <div class="oc-title-sub">Every lock opens three ways. Each way has a price.</div>
      <div class="oc-title-buttons">
        <button class="oc-title-btn" data-act="${canContinue ? 'continue' : 'new'}" type="button">${canContinue ? 'Continue' : 'New Game'}</button>
        ${canContinue ? '<button class="oc-title-btn oc-secondary" data-act="new" type="button">New Game</button>' : ''}
      </div>
      <div class="oc-title-foot">${bestTxt}Drag to look · Click to interact${SLOT ? ` · save slot ${esc(SLOT)}` : ''}</div>`;
    this.ctx.ui.appendChild(el);
    this.el = el;
    const resume = () => this.ctx.audio?.resume?.();
    el.addEventListener('pointerdown', resume, { once: true });
    return new Promise((resolve) => {
      // a press and release on a button is enough (pointerup or click, whichever comes first, once): a click made while
      // the title is still fading in, or one the browser turns into no click (the button moving under the cursor as it
      // rises), still starts the game
      let busy = false;
      const act = async (e) => {
        const b = e.target.closest?.('[data-act]');
        if (!b || busy || (e.type === 'pointerup' && e.button !== 0)) return;
        busy = true;
        try { await choose(b); } finally { busy = false; }
      };
      el.addEventListener('pointerup', act);
      el.addEventListener('click', act);
      let chosen = false;
      const choose = async (b) => {
        if (chosen) return;
        resume();
        const act = b.dataset.act;
        if (act === 'new' && canContinue) {
          const ok = await this.ctx.hud.confirm({ title: 'New game?', text: 'This will forget your current progress.', ok: 'Start fresh', cancel: 'Never mind' });
          if (!ok) return;
        }
        chosen = true;
        this.ctx.audio?.play('click');
        resolve(act);
      };
    });
  }

  hide() {
    const el = this.el;
    if (!el) return;
    el.classList.add('oc-hidden');
    setTimeout(() => el.remove(), 1000);
    this.el = null;
  }
}
