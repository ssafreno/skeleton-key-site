// The game-side wrapper around src/logic/house.js: persists the house state in ctx.state, runs the choreography
// that every lock shares (ring → Mrs. Tallow walks over; force → the key turns and a tooth goes), the call after
// the seventh lock, the settling in the cellar (pay, her offer, the keys), and keeps the HUD key panel and the
// ledger paper in sync. Rooms animate their own lock opening via the `onOpen` callback. The contract rooms build
// against is docs/notes/build-api.md.
import * as H from '../logic/house.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NAMES = { finch: 'Mr. Finch', pell: 'Miss Pell', wick: 'Mr. Wick' };

export class House {
  constructor(ctx) {
    this.ctx = ctx;
    this._focus = null;      // { lockId, onOpen, after, stay } while a lock focus view is open
    this._listeners = new Set();
    ctx.state.on('reset', () => this._sync());
    ctx.state.on('change', (k) => { if (k === 'house') this._sync(); });
    this._sync();
  }

  // ---- state -----------------------------------------------------------------
  get s() {
    const raw = this.ctx.state.get('house');
    if (!raw) return H.initial();
    if (raw.items && raw.order) return raw;
    const m = H.migrate(raw); this.ctx.state.set('house', m); return m; // a save from the slice
  }
  _set(n) { this.ctx.state.set('house', n); }
  reset() { this._set(H.initial()); }
  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _sync() {
    const s = this.s;
    this.ctx.items.bonekey.teeth = s.teeth;
    const o = H.owed(s);
    this.ctx.hud.setKey?.(s.teeth, o.unpaid, { ...o, clock: H.clockText(s), doorTeeth: H.DOOR_TEETH });
    this.ctx.papers?.refreshLedger?.();
    this._syncRing();
    for (const fn of this._listeners) { try { fn(s); } catch (e) { console.error(e); } }
  }

  isOpen(lockId) { return H.isOpen(this.s, lockId); }
  verb(lockId) { return this.s.opened[lockId] || null; }
  available(lockId) { return H.available(this.s, lockId); }
  canOpen(lockId) { return H.canOpen(this.s, lockId); }
  has(itemId) { return H.has(this.s, itemId); }
  summary() { return H.summary(this.s); }
  clockText() { return H.clockText(this.s); }
  ending() { return H.ending(this.s); }
  record() { return H.record(this.s); }
  /** Where everyone is, for rooms placing figures in build(). */
  residents() {
    const s = this.s;
    return {
      tallow: { place: s.called ? 'cellar' : 'foyer' },
      finch: { place: s.finch_out ? 'garden' : 'chair', lantern: s.lantern_given === 'finch', key: s.items.finchkey },
      pell: { place: s.called && s.pell_down ? 'cellar' : 'parlour', down: s.pell_down, lantern: s.lantern_given === 'pell', key: s.items.pellkey },
      wick: { place: s.called && s.wick_down ? 'cellar' : 'nursery', down: s.wick_down, lantern: s.lantern_given === 'wick', key: s.items.wickkey },
    };
  }
  // slice getters, kept
  get lantern() { return H.lanternState(this.s); }
  get lanternWith() { return this.s.lantern_given; }
  get finch() { return this.s.finch_out ? 'garden' : 'chair'; }
  get wrench() { return H.has(this.s, 'wrench'); }
  get called() { return this.s.called; }
  get up() { return this.s.up; }
  get pageTaken() { return this.s.page_taken; }
  get wickDown() { return this.s.wick_down; }
  get pellDown() { return this.s.pell_down; }
  get finchOut() { return this.s.finch_out; }
  get unpaid() { return H.unpaid(this.s).length; }
  get teeth() { return this.s.teeth; }

  // ---- lock focus (the Ring button lives here) -------------------------------
  /**
   * A room calls this when it opens a lock's focus view; the HUD shows the bell while the lock is shut.
   * After the call an unopened lock answers "Not tonight." instead (returns false and leaves any close-up).
   */
  focusLock(lockId, { onOpen, after, stay = false, keep = false } = {}) {
    if (!this.isOpen(lockId) && !this.canOpen(lockId)) {
      this.ctx.dialogue.caption('caption.nope.late');
      if (this.ctx.camera.inFocus) this.ctx.camera.exitFocus();
      return false;
    }
    this._focus = { lockId, onOpen, after, stay, keep };
    this._syncRing();
    if (!this.isOpen(lockId)) this._firstContact(lockId);
    return true;
  }
  /**
   * The first lock close-up of a run: Mrs. Tallow says what the yellow key costs (`tallow.ways`, once), then the three
   * verbs stay on screen as a caption (`caption.ways`, once) while the player looks at the lock.
   */
  async _firstContact(lockId) {
    const { state, dialogue } = this.ctx;
    if (state.get('ways.shown') || this.ctx.game._titleMode) return;
    state.set('ways.shown', true);
    const scope = this.ctx.hotspots.scope;
    if (this.ctx.script?.['tallow.ways']) await dialogue.say('tallow.ways');
    if (this._focus?.lockId === lockId) dialogue.caption('caption.ways', { scope, duration: 7 });
  }
  blurLock() {
    this._focus = null; this._syncRing();
    if (this._callDeferred) this._flushCall();
  }
  /**
   * A call deferred by a container (`stay`) close-up runs once that close-up has closed (Back, Esc, or a room change,
   * which also blurs): after the camera has left and any room transition and line have finished.
   */
  async _flushCall() {
    if (this._callFlushing) return;
    this._callFlushing = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      await wait(50);
      const { game, dialogue, camera } = this.ctx;
      for (let i = 0; i < 300 && (game._transitioning || dialogue.busy || camera.mode === 'tween'); i++) await wait(50);
      if (!this._callDeferred) return;
      this._callDeferred = false;
      await this._runCall();
    } finally { this._callFlushing = false; }
  }
  _syncRing() {
    const f = this._focus;
    // hidden while a lock is opening (she is answering the bell, the key is turning): it comes back only for a shut lock
    const show = !!f && !this._opening && !this.isOpen(f.lockId) && this.available(f.lockId).ring && !this.ctx.game._titleMode;
    this.ctx.hud.showRing?.(show);
  }
  /** HUD bell pressed. */
  ring() {
    const f = this._focus;
    if (!f || this.isOpen(f.lockId)) return;
    return this.open(f.lockId, 'ring', { onOpen: f.onOpen, after: f.after, stay: f.stay, keep: f.keep });
  }

  // ---- the shared choreography -----------------------------------------------
  /**
   * Open a lock with a verb. `onOpen(verb)` is the room's open animation (awaited); `after(verb)` runs once the lines
   * are done and the focus view has closed (e.g. Finch standing up, the resident's choice). `stay` keeps the focus
   * view open (containers). If this was the seventh lock the call runs after `after`. Resolves true when the lock
   * opened. Illegal moves (already open, no tool, no teeth) resolve false without side effects; a lock that
   * refuses because the house has called says "Not tonight."
   */
  async open(lockId, verb, { onOpen, after, stay = false, keep = false } = {}) {
    const { dialogue, audio, hotspots, game, inventory } = this.ctx;
    if (!this.isOpen(lockId) && !this.canOpen(lockId)) { dialogue.caption('caption.nope.late'); return false; }
    const a = this.available(lockId);
    if (!a[verb]) return false;
    if (this._opening) return false;
    this._opening = true;
    this._syncRing();
    hotspots.lock();
    let opened = false;
    const before = this.s;
    try {
      const room = game.currentRoom;
      if (verb === 'ring') {
        audio.play('chime', { gain: 0.7, pitch: 1.6 });
        const first = before.favours.length === 0;
        // door locks: leave the close-up so the player watches her cross the room; containers keep their focus
        if (!stay && this._focus?.lockId === lockId && this.ctx.camera.inFocus) await this.ctx.camera.exitFocus();
        // already standing in the room? then not "I was on my way" (rooms expose tallowHere(); optional)
        let here = false;
        try { here = !!room?.tallowHere?.(); } catch (e) { console.error(e); }
        const arrive = room?.tallowTo?.(lockId); // the room walks her over, if she is in it
        if (arrive) await arrive;
        await dialogue.say(first ? 'react.ring.first' : here && this.ctx.script?.['react.ring.here'] ? 'react.ring.here' : 'react.ring.again');
      }
      if (verb === 'force') {
        audio.play('keyTurn', { gain: 0.9, pitch: 0.8 });
        await this.ctx.tween.delay(0.35);
        audio.play('stoneGrind', { gain: 0.5, pitch: 1.4 });
        this.ctx.camera.shake(0.012, 0.35);
      }
      this._set(H.open(before, lockId, verb));
      this.ctx.state.solve?.(lockId); // hints move on to the next lock
      if (verb === 'force') inventory.refreshIcon('bonekey');
      if (before.clock === 0) audio.setClockRunning?.(true);
      room?.onClockTick?.(this.s.clock);
      try { await onOpen?.(verb); } catch (e) { console.error(e); }
      await dialogue.say(this._fillLines(`react.${lockId}.${verb}`, before));
      if (verb === 'force') await dialogue.say(this._forceLine(before));
      // `keep` (a door lock): the close-up stays where onOpen left it (pulled back on the open doorway), so the door's
      // own hotspot goes through from there in one click; Back leaves as usual. Containers (`stay`) keep it too.
      if (!stay && !keep && this._focus?.lockId === lockId && this.ctx.camera.inFocus) await this.ctx.camera.exitFocus();
      opened = true;
    } finally {
      hotspots.unlock();
      this._opening = false;
      this._syncRing();
    }
    if (opened) { try { await after?.(verb); } catch (e) { console.error(e); } }
    // the sixth lock: one more and the house calls. She says so, once a night, so nobody loses a wing unwarned
    if (opened && !this.s.called && H.locksOpened(this.s) === H.LOCK_BUDGET - 1 && !this.ctx.state.get('tallow.sixth.said')
      && this.ctx.script?.['tallow.sixth']) {
      this.ctx.state.set('tallow.sixth.said', true);
      await dialogue.say('tallow.sixth');
    }
    if (opened && !before.called && this.s.called) {
      // a container close-up (the cupboard as the seventh lock) stays open so its contents can be taken first: the
      // call waits for the player to leave it (blurLock), rather than pulling them out past the lantern
      if (stay && this._focus?.lockId === lockId && this.ctx.camera.inFocus) this._callDeferred = true;
      else await this._runCall();
    }
    return opened;
  }

  /** A lock's lines with `{nohole}` filled from `react.force.nohole` (by teeth already spent, so it rotates). */
  _fillLines(key, before) {
    const pool = this.ctx.script?.['react.force.nohole'];
    const lines = this.ctx.dialogue.resolve(key);
    if (!Array.isArray(pool) || !lines.some((l) => l.text?.includes('{nohole}'))) return key;
    const pick = pool[before.spent.length % pool.length];
    return lines.map((l) => ({ ...l, text: l.text.replace(/\{nohole\}/g, pick) }));
  }
  /**
   * The line after a force: the first one counts, the one that leaves four warns about the chair, the rest rotate through
   * `react.force.again` in order (by the number of teeth already spent, so a reload does not repeat one).
   */
  _forceLine(before) {
    if (before.spent.length === 0) return 'react.force.first';
    if (before.teeth === H.DOOR_TEETH + 1 && this.ctx.script?.['react.force.four']) return 'react.force.four';
    const pool = this.ctx.script?.['react.force.again'];
    if (!Array.isArray(pool) || !Array.isArray(pool[0])) return 'react.force.again';
    return pool[(before.spent.length - 1) % pool.length];
  }

  /**
   * The house calls: the clock stops, the room puts her beside you (`onCall`, awaited, so she is in place before she
   * speaks), her line, then the room's reaction (`afterCall`: the baize door opens, a resident goes down).
   */
  async _runCall() {
    const { dialogue, audio, hotspots, game } = this.ctx;
    hotspots.lock();
    try {
      if (this.ctx.camera.inFocus) await this.ctx.camera.exitFocus();
      audio.setClockRunning?.(false);
      const room = game.currentRoom;
      try { await room?.onCall?.(); } catch (e) { console.error(e); }
      // "Leave that; it will keep." only when there is something in your hand to leave
      await dialogue.say(this.ctx.inventory?.selected || !this.ctx.script?.['tallow.call.empty'] ? 'tallow.call' : 'tallow.call.empty');
      try { await room?.afterCall?.(); } catch (e) { console.error(e); }
      // where: the baize door, by the stair (the plan marks it from now on; hints after the call say it again)
      if (this.ctx.script?.['tallow.call.where']) await dialogue.say('tallow.call.where');
    } finally { hotspots.unlock(); this._syncRing(); }
  }

  /** The hall bell, "The cellar": the early call. One favour. Resolves false if the house has already called. */
  async callEarly() {
    if (this.s.called) return false;
    this._set(H.callEarly(this.s));
    await this.ctx.dialogue.say('react.bell.early');
    await this._runCall();
    return true;
  }

  // ---- items and the residents' choices ----------------------------------------
  /** Take an item out of its container (the logic checks the lock is open). Adds it to the inventory. */
  take(itemId, { from, silent = false } = {}) {
    if (this.s.items[itemId] !== 'away') return false;
    try { this._set(H.take(this.s, itemId)); } catch (e) { console.warn('[house]', e.message); return false; }
    this.ctx.inventory.add(itemId, { from, silent });
    return true;
  }
  takeKey(itemId, opts) { return this.take(itemId, opts); }
  takeLantern() { if (this.lantern === 'none' && this.isOpen('cup')) this._set(H.takeLantern(this.s)); }
  takeWrench() { if (!this.wrench && this.s.items.wrench === 'away') this._set(H.takeWrench(this.s)); }
  /** Leave the lantern with a resident. Removes it from the inventory. */
  giveLantern(to = 'finch') {
    if (this.lantern !== 'carried') return false;
    try { this._set(H.giveLantern(this.s, to)); } catch (e) { console.warn('[house]', e.message); return false; }
    this.ctx.inventory.remove('lantern');
    return true;
  }
  letFinchOut() { if (!this.s.finch_out && this.isOpen('garden')) this._set(H.letFinchOut(this.s)); }
  bringWickDown() { if (!this.s.wick_down && this.isOpen('mock')) this._set(H.bringWickDown(this.s)); }
  takePage() { return this.take('page'); }
  pageOffered() { return H.pageOffered(this.s); }
  /** Use a resident's key on its owner, in the cellar. Says `react.<resident>.key`. */
  async giveKey(itemId, resident) {
    try { this._set(H.giveKey(this.s, itemId, resident)); } catch (e) { console.warn('[house]', e.message); return false; }
    this.ctx.inventory.remove(itemId);
    await this.ctx.dialogue.say(`react.${resident}.key`);
    return true;
  }
  present(resident) { return H.present(this.s, resident); }

  // ---- the settling --------------------------------------------------------------
  canPay(itemId) { return H.canPay(this.s, itemId); }
  /** Use an item on the ledger: the page adds her three lines first; Tallow says "Paid."; the item burns. */
  async pay(itemId) {
    const { dialogue, inventory, audio } = this.ctx;
    if (H.isKey(itemId) && this.has(itemId)) { await dialogue.say('react.pay.key'); return false; } // it stays in your pocket
    if (itemId === 'bonekey') { await dialogue.say('react.pay.bonekey'); return false; } // the yellow key is never currency
    if (!this.canPay(itemId)) return false;
    // the book moves first, so the HUD's count changes with the click, not a line or two later
    this._set(H.pay(this.s, itemId));
    inventory.remove(itemId);
    if (itemId === 'page') await dialogue.say('react.pay.page');
    audio.play('stoneGrind', { gain: 0.3, pitch: 0.6 });
    await dialogue.say(this._payLines(itemId));
    return true;
  }
  /** `react.pay` with `{item}` replaced by the thing paid ("The wrench goes into the furnace…"). */
  _payLines(itemId) {
    const lines = this.ctx.dialogue.resolve('react.pay');
    const def = this.ctx.items?.[itemId];
    let name = def?.payName || def?.name || 'it';
    name = name.replace(/^(The|A|An) /i, '');
    if (!/^(Miss|Mr|Mrs)\.? /.test(name)) name = name.charAt(0).toLowerCase() + name.slice(1);
    const the = /^(Miss|Mr|Mrs)\.? /.test(name) ? '' : 'the ';
    // `{item} goes` agrees with the item: "The pliers go into the furnace" (items.js `plural`)
    const fill = (t) => (def?.plural ? t.replace(/\{item\} goes\b/g, '{item} go') : t).replace(/\{item\}/g, `${the}${name}`);
    return lines.map((l) => ({ ...l, text: fill(l.text).replace(/^the /, 'The ').replace(/^(\w)/, (c) => c.toUpperCase()) }));
  }
  canOffer() { return H.canOffer(this.s); }
  /** The ledger clicked with no item: her offer. Resolves true if a line moved to Miss Pell's page. */
  async offerPell() {
    if (!this.canOffer()) return false;
    const { dialogue } = this.ctx;
    // the line moves the moment "Put one on her page" is taken (the HUD with it), then the reply
    const idx = await dialogue.choice('choice.tally', { onPick: (i) => { if (i === 0 && this.canOffer()) this._set(H.moveToPell(this.s)); } });
    if (idx !== 0) return false;
    if (this.present('pell')) {
      // her answer, and (the first time only) the narrator catching it: straight after the yes, nothing in between
      const first = !this.ctx.state.get('pell.caught.said');
      this.ctx.state.set('pell.caught.said', true);
      await dialogue.say(first ? [...dialogue.resolve('react.pell.tally'), ...dialogue.resolve('react.pell.caught')] : 'react.pell.tally');
    }
    return true;
  }
  /** Alias for rooms that want the move without the choice (dev, tests). */
  moveToPell() { if (!this.canOffer()) return false; this._set(H.moveToPell(this.s)); return true; }
  keysHeld() { return H.keysHeld(this.s); }
  /** The cellar stair: keys go back on their hooks (`react.key.back` if any), the clock runs on to midnight. */
  async goUp() {
    if (!this.s.called || this.s.up) return false;
    const back = this.keysHeld();
    this._set(H.goUp(this.s));
    for (const id of back) this.ctx.inventory.remove(id);
    if (back.length) await this.ctx.dialogue.say('react.key.back');
    return true;
  }
  /** The front door at midnight has done its lines: keep the record, show the card. Resolves when the player restarts. */
  async endNight() {
    const { game, memorial, card, hud, inventory } = this.ctx;
    if (!this.s.up) this._set(H.goUp(this.s));
    game.stopTimer();
    hud.setVisible(false); inventory.setVisible(false);
    const rec = memorial.record(this.s);
    return card.show(rec);
  }

  /**
   * Dev: `?house=open:cup:pick,lantern,open:moons:ring,wrench,give,finch` applies moves in order.
   * Grammar: open:<lock>:<verb> · take:<item> · lantern (take:lantern) · wrench (take:wrench) · page (take:page) ·
   * give[:<resident>] (the lantern; default finch) · finch · wick · call · pay:<item> · pell · key:<resident> · up
   */
  devApply(entries) {
    let s = this.s;
    const inv = this.ctx.inventory;
    for (const e of entries) {
      const [op, a, b] = e.split(':');
      try {
        if (op === 'open') { s = H.open(s, a, b || 'pick'); this.ctx.state.solve?.(a); }
        else if (op === 'take') { s = H.take(s, a); inv.add(a, { silent: true }); }
        else if (op === 'lantern') { s = H.take(s, 'lantern'); inv.add('lantern', { silent: true }); }
        else if (op === 'wrench') { s = H.take(s, 'wrench'); inv.add('wrench', { silent: true }); }
        else if (op === 'page') { s = H.take(s, 'page'); inv.add('page', { silent: true }); }
        else if (op === 'give') { s = H.giveLantern(s, a || 'finch'); inv.remove('lantern'); }
        else if (op === 'finch') s = H.letFinchOut(s);
        else if (op === 'wick') s = H.bringWickDown(s);
        else if (op === 'call') s = H.callEarly(s);
        else if (op === 'pay') { s = H.pay(s, a); inv.remove(a); }
        else if (op === 'pell') s = H.moveToPell(s);
        else if (op === 'key') { const id = `${a}key`; s = H.giveKey(s, id, a); inv.remove(id); }
        else if (op === 'up') { for (const id of H.keysHeld(s)) inv.remove(id); s = H.goUp(s); }
        else console.warn('[house] unknown dev move', e);
      } catch (err) { console.warn('[house] dev move failed', e, err.message); }
    }
    this._set(s);
  }

  // ---- the ledger ------------------------------------------------------------
  ledgerPaper() {
    const s = this.s;
    const row = (k, v, cls = '') => `<div class="oc-ledger-row${cls}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
    const what = (f) => f.lock === 'early' ? 'Went down early' : f.lock === 'pell' ? "One of Miss Pell's lines" : `Opened ${H.LOCKS[f.lock]?.label || f.lock}`;
    const mine = s.favours.filter((f) => f.page === 'mine');
    const hers = s.favours.filter((f) => f.page === 'pell');
    let html = '';
    html += `<div class="oc-ledger-head">The night of October 31st · ${esc(H.clockText(s))}${s.called ? ' · the house has called' : ''}</div>`;
    html += `<h3>Your page</h3>`;
    html += mine.length
      ? mine.map((f, i) => row(`${i + 1}. ${what(f)}`, f.paid ? `paid, with the ${this.ctx.items[f.paid]?.name?.replace(/^(The|A|An) /i, '').toLowerCase() || f.paid}` : 'one favour', f.paid ? ' oc-ledger-paid' : '')).join('')
      : `<div class="oc-ledger-none">none, as yet</div>`;
    html += `<h3>Miss Pell's page</h3>`;
    if (s.page_taken) html += `<div class="oc-ledger-none">${s.items.page === 'burned' ? 'Torn out, and paid. Her three lines are on your page now.' : `Torn out. It is in your pocket, with her ${H.PELL_LINES} lines: they become yours when it goes on the book.`}</div>`;
    else {
      html += `<div class="oc-ledger-note">Thirty-one lines, 1958, twenty-eight struck through.</div>`;
      html += hers.map((f, i) => row(`${32 + i}. ${what(f)}`, 'one favour, in your hand')).join('');
    }
    html += `<h3>Paid in teeth</h3>`;
    html += s.spent.length ? s.spent.map((l, i) => row(`${i + 1}. Forced ${H.LOCKS[l].label}`, 'one tooth')).join('') : `<div class="oc-ledger-none">none, as yet</div>`;
    html += `<h3>Noted</h3>`;
    const notes = [];
    if (s.items.lantern === 'held') notes.push('Took the guest lantern.');
    if (s.items.lantern === 'given') notes.push(`Left the guest lantern with ${NAMES[s.lantern_given] || 'somebody'}.`);
    if (s.items.lantern === 'burned') notes.push('The guest lantern went into the furnace.');
    if (s.items.wrench !== 'away') notes.push("Took Mr. Finch's wrench.");
    if (s.items.hatpin !== 'away') notes.push("Took Miss Pell's hatpin.");
    if (s.items.blank !== 'away') notes.push("Took a blank from Mr. Wick's little house.");
    if (s.finch_out) {
      const withLight = s.lantern_given === 'finch';
      const refused = !withLight && this.ctx.state.get('cons.finch.asked', false);
      notes.push(`Let Mr. Finch out${withLight ? ', with the light' : ''}.${refused ? ' He was not finished.' : ''}`);
    }
    if (s.page_taken) notes.push("Took Miss Pell's page. She said thank you.");
    if (s.wick_down) notes.push('Brought Mr. Wick down.');
    if (s.pell_down) notes.push('Aired the parlour. Miss Pell will come down.');
    if (s.early) notes.push('Rang to go down early.');
    for (const id of ['wickkey', 'pellkey', 'finchkey']) {
      if (s.items[id] === 'given') notes.push(`Gave ${this.ctx.items[id]?.name || id} back.`);
    }
    html += notes.length ? notes.map((n) => `<div class="oc-ledger-note">${esc(n)}</div>`).join('') : `<div class="oc-ledger-none">nothing, as yet</div>`;
    const { unpaid: u, pocket } = H.owed(s);
    const owedTxt = u ? `${u} ${u === 1 ? 'line' : 'lines'} unpaid on your page.` : 'Nothing unpaid on your page.';
    const pocketTxt = pocket ? ` Miss Pell's ${pocket} are in your pocket.` : '';
    html += `<div class="oc-ledger-foot">The yellow key: ${s.teeth} of ${H.TEETH} teeth, one tooth each time you use it; the front door needs ${H.DOOR_TEETH} teeth left. ${owedTxt}${pocketTxt} ${s.up ? 'Settled at midnight.' : 'The house settles at midnight.'}</div>`;
    return { title: 'Ledger', style: 'ledger', html };
  }
}
