// Cat-click hint logic (DESIGN §6, ARCHITECTURE "Hints").
//
// hints.ask():
//  1. If the room intro hasn't been seen (`<roomId>.intro.seen`) → say `<roomId>.intro`, mark seen.
//  2. "Too early" (in room < 20 s AND < 2 hotspot clicks this visit) → say `early.<roomId>` if present,
//     else falls through to the hint below (the intro is never replayed).
//  3. Loose end: if room.looseEnd() returns a script key (something left behind in an earlier room that this
//     room or the ending will need — the study key / drawer / sardines), say it once per save, then stop.
//  4. current puzzle = first id in Room.puzzleOrder that is not solved and room.prereqMet(id).
//     level = state `hint.<id>.level` (0..). Levels 1→2→3, then alternate idle line / level 3.
//     Says `hint.<id>.<n>`; if room.hintVariant(id) returns a suffix and `hint.<id>.<suffix>.<n>` exists, that
//     line is used instead (e.g. lure hints that send the player back for the sardines). Missing keys → idle.
//  5. Everything solved (or no current puzzle) → say `idle.<roomId>` (random line-array).

import { LOCKS } from '../logic/house.js';

export class Hints {
  constructor(ctx) {
    this.ctx = ctx;
    this.roomTime = 0;
    this.earlySeconds = 20;
    this._asking = false;
    // polish: one-time onboarding nudge — 60 s into room1 with nothing solved and the cat never clicked
    this.nudgeSeconds = 60;
    this._nudgeTime = 0;
  }

  /** Game calls on room enter. */
  resetForRoom() { this.roomTime = 0; }
  update(dt) {
    this.roomTime += dt;
    this._updateNudge(dt);
  }

  _updateNudge(dt) {
    const { game, state, dialogue, hud } = this.ctx;
    if (state.get('nudge.shown') || state.get('hints.asked')) return;
    if (game._titleMode || game.currentRoom?.constructor.id !== 'foyer') return;
    if (dialogue.isOpen || this.ctx.papers?.isOpen || document.hidden) return;
    if (Object.keys(state.data.solved).length) { state.set('nudge.shown', true); return; } // already under way
    this._nudgeTime += dt;
    if (this._nudgeTime < this.nudgeSeconds) return;
    state.set('nudge.shown', true);
    const line = this.ctx.script?.['toast.nudge'] || 'Stuck? Mrs. Tallow would like to be asked.';
    hud.toast(line, 6000, { variant: 'nudge' });
  }
  noteClick() { /* Interaction.clickCount is the source of truth */ }

  /**
   * The lock to hint: the one whose close-up is open (if it is still shut), else the first in the room's puzzleOrder
   * that is still shut and can be opened now. "Shut" asks the house too, so a lock opened by any verb (picked, rung,
   * forced, or a dev move) is never hinted, whatever hint level a room set by hand.
   */
  currentPuzzle(room = this.ctx.game.currentRoom) {
    if (!room) return null;
    const order = room.constructor.puzzleOrder || [];
    const house = this.ctx.house;
    const done = (id) => this.ctx.state.isSolved(id) || !!house?.isOpen?.(id);
    const can = (id) => {
      if (done(id)) return false;
      try { if (house && LOCKS[id] && !house.canOpen(id)) return false; } catch (e) { console.error(e); } // a wing door shut, or the call
      let ok = true;
      try { ok = room.prereqMet ? room.prereqMet(id) !== false : true; } catch (e) { console.error(e); }
      return ok;
    };
    const focused = house?._focus?.lockId;
    if (focused && can(focused)) return focused;
    for (const id of order) if (can(id)) return id;
    return null;
  }

  _has(key) { return !!this.ctx.script && key in this.ctx.script; }

  /**
   * `idle.<room>`, less any lines the room drops now (`room.idleFilter(lineArray) → bool`, e.g. the cellar's cabinet
   * line once the cabinet is open). Returns the key itself when nothing is filtered.
   */
  _idle(room, rid) {
    const key = `idle.${rid}`;
    const v = this.ctx.script?.[key];
    if (typeof room?.idleFilter !== 'function' || !Array.isArray(v) || !Array.isArray(v[0])) return key;
    let kept = v;
    try { kept = v.filter((l) => room.idleFilter(l)); } catch (e) { console.error(e); }
    return kept.length ? kept : key;
  }

  async ask() {
    if (this._asking || this.ctx.dialogue.busy) return;
    this._asking = true;
    try {
      const { state, dialogue, game } = this.ctx;
      const room = game.currentRoom;
      if (!room) return;
      const rid = room.constructor.id;
      try { room.onHintAsked?.(); } catch (e) { console.error(e); }
      state.set('hints.asked', true);
      // after the call, everywhere but downstairs: the way down (she is beside you by then)
      if (this.ctx.house?.called && !this.ctx.house.up && rid !== 'cellar' && rid !== 'midnight' && this._has('hint.called')) {
        await dialogue.say('hint.called');
        return;
      }
      const introKey = `${rid}.intro`;
      if (!state.get(`${rid}.intro.seen`) && this._has(introKey)) {
        state.set(`${rid}.intro.seen`, true);
        await dialogue.say(introKey);
        return;
      }
      const early = this.roomTime < this.earlySeconds && (this.ctx.hotspots.clickCount || 0) < 3; // the cat click itself counts as one
      if (early) {
        if (this._has(`early.${rid}`)) { await dialogue.say(`early.${rid}`); return; }
        // QA: no longer replays the intro (it already auto-played on entry); fall through to a real hint
      }
      // something left behind in an earlier room (the study key, the locked drawer, the tin) — said once
      let loose = null;
      try { loose = room.looseEnd?.() || null; } catch (e) { console.error(e); }
      if (loose && this._has(loose) && !state.get(`loose.${loose}.said`)) {
        state.set(`loose.${loose}.said`, true);
        await dialogue.say(loose);
        return;
      }
      const pid = this.currentPuzzle(room);
      if (pid) {
        const level = state.get(`hint.${pid}.level`, 0);
        let variant = null;
        try { variant = room.hintVariant?.(pid) || null; } catch (e) { console.error(e); }
        const pick = (n) => {
          const vk = variant ? `hint.${pid}.${variant}.${n}` : null;
          return vk && this._has(vk) ? vk : `hint.${pid}.${n}`;
        };
        let key;
        if (level < 3) key = pick(level + 1);
        else key = level % 2 === 1 && this._has(`idle.${rid}`) ? `idle.${rid}` : pick(3);
        state.set(`hint.${pid}.level`, level + 1);
        if (this._has(key)) { await dialogue.say(key === `idle.${rid}` ? this._idle(room, rid) : key); return; }
      }
      if (this._has(`idle.${rid}`)) await dialogue.say(this._idle(room, rid));
      else if (this._has('idle')) await dialogue.say('idle');
      else dialogue.caption('Nobody answers.');
    } finally {
      this._asking = false;
    }
  }
}
