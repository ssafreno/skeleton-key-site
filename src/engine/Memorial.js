// What the house keeps between nights: one record per finished run (the memorial wall), and every room the player
// has stood in (the floor plan). localStorage key 'skeleton-key.memorial.v1'; separate from the save, so a restart
// keeps it. A record is src/logic/house.js `record(state)` plus a night number and a date.
import * as H from '../logic/house.js';
import { store } from './storage.js';

export const MEMORIAL_KEY = 'skeleton-key.memorial.v1';

/** Rooms on the plan, in drawing order. 'garden' and 'step' are not rooms: rooms call visit() for them when the player gets there. */
export const PLAN_ROOMS = ['foyer', 'landing', 'conservatory', 'parlour', 'nursery', 'cellar', 'garden', 'step'];

function blank() { return { v: 1, nights: [], rooms: [] }; }

export class Memorial {
  constructor({ persist = true } = {}) {
    this.persist = persist;
    this.data = blank();
    this.load();
  }

  get nights() { return this.data.nights; }
  /** Tonight's number: the plates on the wall, plus one. */
  get night() { return this.data.nights.length + 1; }
  get rooms() { return new Set(this.data.rooms); }
  hasVisited(roomId) { return this.data.rooms.includes(roomId); }

  /** Game calls this on every room enter; rooms may call it for 'garden' and 'step'. */
  visit(roomId) {
    if (!roomId || this.data.rooms.includes(roomId)) return;
    this.data.rooms.push(roomId);
    this.save();
  }

  /** Close the night: build the end record from the house state, keep it, return it. */
  record(houseState) {
    const rec = { ...H.record(houseState), night: this.night, date: new Date().toISOString().slice(0, 10) };
    this.data.nights.push(rec);
    this.save();
    return rec;
  }

  /** The last plate on the wall, if any. */
  get last() { return this.data.nights[this.data.nights.length - 1] || null; }

  /** One plate's text, in the house's words: NIGHT 3 · 7 TEETH · 2 FAVOURS · MR. FINCH IN THE GARDEN · LEFT AT MIDNIGHT */
  plateText(rec) {
    const fav = rec.favours.paid + rec.favours.onPell + rec.favours.unpaid;
    const parts = [`NIGHT ${rec.night}`, `${rec.teeth} ${rec.teeth === 1 ? 'TOOTH' : 'TEETH'}`, `${fav} ${fav === 1 ? 'FAVOUR' : 'FAVOURS'}`];
    if (rec.residents?.finch === 'by the van') parts.push('MR. FINCH IN THE GARDEN');
    parts.push({
      staff: 'STAFF', teeth: 'THE CHAIR', tally: 'ON HER PAGE', procession: rec.card === 'card.procession.two' ? 'TWO ON THE STEP' : 'THREE ON THE STEP', finch: 'LEFT AT MIDNIGHT',
      paid: 'PAID IN FULL', clean: 'NOTHING OWED',
    }[rec.ending] || 'LEFT AT MIDNIGHT');
    return parts.join(' · ');
  }

  // ---- the floor plan paper ------------------------------------------------------------------------------
  /**
   * A `plan` style paper: outlines of the house, each room lit once the player has stood in it on any night. The baize
   * door (north-west corner of the hall) is always drawn; once the house has called (`called`), it is marked in red
   * with the way down to the cellar.
   */
  planPaper({ called = false } = {}) {
    const lit = this.rooms;
    const R = {
      foyer:        { x: 120, y: 150, w: 120, h: 110, label: 'Foyer' },
      landing:      { x: 120, y: 100, w: 120, h: 50,  label: 'Landing' },
      conservatory: { x: 240, y: 140, w: 110, h: 120, label: 'Conservatory' },
      parlour:      { x: 10,  y: 140, w: 110, h: 120, label: 'Parlour' },
      nursery:      { x: 120, y: 20,  w: 120, h: 80,  label: 'Nursery' },
      cellar:       { x: 10,  y: 280, w: 230, h: 60,  label: 'Cellar' },
      garden:       { x: 350, y: 120, w: 40,  h: 160, label: 'Garden', path: true },
      step:         { x: 150, y: 260, w: 60,  h: 18,  label: 'Front step' },
    };
    let svg = `<svg class="oc-plan-svg" viewBox="0 0 400 350" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Floor plan">`;
    for (const id of PLAN_ROOMS) {
      const r = R[id];
      const on = lit.has(id);
      const cls = `oc-plan-room${on ? ' oc-plan-lit' : ''}${r.path ? ' oc-plan-path' : ''}`;
      svg += `<g class="${cls}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="2"/>`;
      // a tall, narrow strip (the garden) runs its label down the strip, so it never runs off the paper's edge
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const turn = r.h > r.w * 2 ? ` transform="rotate(90 ${cx} ${cy})"` : '';
      svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle"${turn}>${r.label}</text></g>`;
    }
    // the stair, the baize door, the front door
    svg += `<g class="oc-plan-mark${called ? ' oc-plan-called' : ''}"><path d="M128 150 h20 M128 142 h20 M128 134 h20 M128 126 h20 M128 118 h20 M128 110 h20"/>`;
    svg += `<path d="M190 150 h40"/><path d="M170 260 h20" stroke-width="3"/>`;
    svg += `<path class="oc-plan-baize" d="M120 156 v22"/></g>`; // the baize door: the hall's west wall, by the stair
    if (called) {
      // the way leaves the door westward, under the parlour, so it never crosses the hall's label; the note sits in the
      // hall's upper-left corner, between the stair marks (y <= 150) and the Foyer label (y ~199..213)
      svg += `<path class="oc-plan-way" d="M118 172 C 96 200, 96 252, 84 282"/>`;
      svg += `<text class="oc-plan-note" x="126" y="170">baize door, open:</text><text class="oc-plan-note" x="126" y="184">the way down</text>`;
    }
    svg += `</svg>`;
    const seen = PLAN_ROOMS.filter((id) => lit.has(id)).length;
    const way = called ? '<div class="oc-plan-foot">The house has called. The baize door, by the stair, is open: the cellar is down it.</div>' : '';
    const html = `<div class="oc-plan-wrap">${svg}</div>${way}<div class="oc-plan-foot">${seen === 0 ? 'Nothing lit. You have not been anywhere yet.' : seen === PLAN_ROOMS.length ? 'Every room lit. The house has nothing left to show you, which is not the same as nothing left.' : `${seen} of ${PLAN_ROOMS.length} lit. The dark ones are still there.`}</div>`;
    return { title: '9 Vesper Lane', style: 'plan', html };
  }

  // ---- persistence ---------------------------------------------------------------------------------------
  save() {
    if (!this.persist) return;
    store.set(MEMORIAL_KEY, JSON.stringify(this.data));
  }
  load() {
    try {
      const d = JSON.parse(store.get(MEMORIAL_KEY) || 'null');
      if (d && d.v === 1 && Array.isArray(d.nights) && Array.isArray(d.rooms)) this.data = d;
    } catch (e) { /* ignore */ }
  }
  /** Forget every night (dev: `?forget`). */
  clear() { this.data = blank(); store.remove(MEMORIAL_KEY); }
}
