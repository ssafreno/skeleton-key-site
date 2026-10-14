// The end card (GAME.md §8): an HTML overlay at midnight. Everything the player paid, on one card, from a memorial
// record (src/logic/house.js `record`, plus night and date from src/engine/Memorial.js).
import { TEETH, ENDING_NAMES } from '../logic/house.js';
import { store } from './storage.js';

const CARD_GRACE_MS = 700;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Card {
  constructor(ctx) { this.ctx = ctx; this.el = null; }

  /**
   * Show the card for a record. Without one, the current house state is recorded now (the slice's garden-door exit
   * still works). Resolves 'again' when the player chooses "Same night next year"; the run restarts with the
   * memorial kept (it lives under its own storage key).
   */
  show(rec) {
    const { script, state, game, memorial, house } = this.ctx;
    if (!rec) rec = memorial.record(house.s);
    game.stopTimer();
    store.set('skeleton-key.best', String(Math.round(state.elapsed)));

    const teeth = Array.from({ length: TEETH }, (_, i) => `<span class="oc-tooth${i < rec.teeth ? '' : ' oc-tooth-gone'}"></span>`).join('');
    const f = rec.favours;
    const favours = `${f.paid} paid · ${f.onPell} on Miss Pell's page · ${f.unpaid} unpaid`;
    const line = script?.[rec.card] || '';
    const name = ENDING_NAMES[rec.ending] || rec.ending;
    const r = rec.residents || {};
    const el = document.createElement('div');
    el.className = 'oc-card';
    el.innerHTML = `
      <div class="oc-card-inner">
        <div class="oc-card-kicker">Midnight · ${esc(name)}</div>
        <div class="oc-card-row"><span class="oc-card-k">The yellow key</span><span class="oc-card-v"><span class="oc-teeth">${teeth}</span> ${TEETH} → ${rec.teeth}</span></div>
        <div class="oc-card-row"><span class="oc-card-k">Favours</span><span class="oc-card-v">${esc(favours)}</span></div>
        <div class="oc-card-row"><span class="oc-card-k">The lantern</span><span class="oc-card-v">${esc(rec.lantern || 'kept')}</span></div>
        <div class="oc-card-row"><span class="oc-card-k">Mr. Finch</span><span class="oc-card-v">${esc(r.finch || 'in his chair')}</span></div>
        <div class="oc-card-row"><span class="oc-card-k">Miss Pell</span><span class="oc-card-v">${esc(r.pell || 'in the parlour')}</span></div>
        <div class="oc-card-row"><span class="oc-card-k">Mr. Wick</span><span class="oc-card-v">${esc(r.wick || 'at his bench')}</span></div>
        <div class="oc-card-line">${esc(line)}</div>
        <div class="oc-card-foot">Night ${rec.night}${rec.early ? ' · went down early' : ''} · the hall clock ${esc(rec.clock || '12:00')}</div>
        <button class="oc-title-btn" type="button" data-act="again">Same night next year</button>
      </div>`;
    document.body.appendChild(el); // outside #ui so it sits above the fade layer
    this.el = el;
    requestAnimationFrame(() => el.classList.add('oc-card-in'));
    // the click that closed the last ending line must not land on the button: the card ignores clicks for a moment
    const shownAt = performance.now();
    return new Promise((resolve) => {
      el.querySelector('[data-act="again"]').addEventListener('click', () => {
        if (performance.now() - shownAt < CARD_GRACE_MS) return; this.ctx.audio?.play('click'); resolve('again'); game.restart(); });
    });
  }
}
