// The house, as pure logic. No three.js, no DOM: a plain state object and functions that return new ones.
// The game (src/engine/House.js) wraps this and persists it; scripts/simulate.mjs walks it headless.
// Rules: docs/GAME.md §2 (the budget, items), §7 (the call, the settling), §8 (endings).
//
// State shape (JSON-safe):
//   opened:   { [lockId]: 'pick' | 'ring' | 'force' }
//   order:    [lockId]                       locks in the order they opened
//   favours:  [{ lock, page, paid }]         lock: a lockId | 'early' (the bell) | 'pell' (one of her three lines);
//                                            page: 'mine' | 'pell'; paid: null | itemId
//   spent:    [lockId]                       one entry per force (one tooth each), in order
//   teeth:    number                         9 at the start of a night
//   items:    { [itemId]: 'away' | 'held' | 'given' | 'burned' | 'hook' }
//   clock:    number                         minutes past 11:41; two per lock opened
//   called:   boolean                        the house has called (after the seventh lock, or the early bell)
//   early:    boolean                        the call was the bell
//   up:       boolean                        the player went up the cellar stair (the settling is over)
//   lantern_given: null | 'finch' | 'pell' | 'wick'
//   finch_out, page_taken, wick_down, pell_down: booleans (pell_down is true whenever `shutters` opened)

export const TEETH = 9;
export const DOOR_TEETH = 4;         // the front door wants four
export const LOCK_BUDGET = 7;        // the house calls after the seventh lock
export const MINUTES_PER_LOCK = 2;
export const CLOCK_START = { h: 11, m: 41 };

export const LOCKS = {
  cup:      { room: 'foyer',        label: 'the cupboard under the stair', container: true },
  moons:    { room: 'foyer',        label: 'the conservatory doors',       wing: 'conservatory' },
  parlour:  { room: 'foyer',        label: 'the parlour door',             wing: 'parlour' },
  landing:  { room: 'foyer',        label: 'the nursery door',             wing: 'nursery' },
  bag:      { room: 'conservatory', label: "Mr. Finch's bag",              container: true, door: 'moons' },
  garden:   { room: 'conservatory', label: 'the garden door',              door: 'moons',   tool: 'wrench' },
  caddy:    { room: 'parlour',      label: 'the tea caddy',                container: true, door: 'parlour' },
  shutters: { room: 'parlour',      label: 'the parlour shutters',         door: 'parlour', tool: 'hatpin' },
  dolls:    { room: 'nursery',      label: "the doll's house",             container: true, door: 'landing' },
  mock:     { room: 'nursery',      label: 'the mock front door',          door: 'landing', tool: 'blank' },
  cabinet:  { room: 'cellar',       label: 'the key cabinet',              container: true, cellar: true },
};
export const LOCK_IDS = Object.keys(LOCKS);
export const VERBS = ['pick', 'ring', 'force'];

/** Items: where each comes from, and whether it pays a favour at the settling (not the yellow key, the slip, or a resident's key: those never leave the house). */
export const ITEMS = {
  slip:     { start: true,  currency: false },
  pliers:   { start: true,  currency: true },
  bonekey:  { start: true,  currency: false },
  lantern:  { from: 'cup',      currency: true },
  wrench:   { from: 'bag',      currency: true },
  hatpin:   { from: 'caddy',    currency: true },
  blank:    { from: 'dolls',    currency: true },
  page:     { from: 'shutters', currency: true },
  wickkey:  { from: 'cabinet',  currency: false, owner: 'wick', teeth: 9 },
  pellkey:  { from: 'cabinet',  currency: false, owner: 'pell', teeth: 9 },
  finchkey: { from: 'cabinet',  currency: false, owner: 'finch', teeth: 3 },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const RESIDENTS = ['finch', 'pell', 'wick'];
export const ENDINGS = ['staff', 'teeth', 'tally', 'procession', 'finch', 'paid', 'clean'];
export const ENDING_NAMES = {
  staff: 'Staff', teeth: 'The chair', tally: 'On her page', procession: 'Procession', finch: 'The garden', paid: 'Paid in full', clean: 'Nothing owed',
};

export function initial() {
  const items = {};
  for (const [id, it] of Object.entries(ITEMS)) items[id] = it.start ? 'held' : 'away';
  return {
    opened: {}, order: [], favours: [], spent: [], teeth: TEETH, items, clock: 0,
    called: false, early: false, up: false,
    lantern_given: null, finch_out: false, page_taken: false, wick_down: false, pell_down: false,
  };
}

// ---- reading ---------------------------------------------------------------------------------------------
export function isOpen(s, lockId) { return !!s.opened[lockId]; }
export function has(s, itemId) { return s.items[itemId] === 'held'; }
export function locksOpened(s) { return s.order.length; }
export function unpaid(s) { return s.favours.filter((f) => f.page === 'mine' && !f.paid); }
export function onPell(s) { return s.favours.filter((f) => f.page === 'pell'); }
export function paidFavours(s) { return s.favours.filter((f) => f.page === 'mine' && f.paid); }
export const PELL_LINES = 3;        // the lines on Miss Pell's page; they become yours when it goes on the book
/**
 * What the HUD, the ledger paper and the cellar's book all show (one source, so they never disagree): `unpaid` is your
 * page's unpaid lines (the stair, the door and the card count these); `pocket` is Miss Pell's lines while her torn page is
 * in your pocket (not yet yours: they are written in when the page pays at the settling).
 */
export function owed(s) {
  return { unpaid: unpaid(s).length, pocket: s.page_taken && s.items.page === 'held' ? PELL_LINES : 0 };
}
export function currency(s) { return ITEM_IDS.filter((id) => ITEMS[id].currency && has(s, id)); }

/** The slice's lantern word: 'none' | 'carried' | 'given' | 'burned'. */
export function lanternState(s) {
  const v = s.items.lantern;
  return v === 'held' ? 'carried' : v === 'away' ? 'none' : v;
}

/** Can this lock be opened at all right now (any verb)? Locks refuse after the call; the cabinet only answers it. */
export function canOpen(s, lockId) {
  const lock = LOCKS[lockId];
  if (!lock || isOpen(s, lockId) || s.up) return false;
  if (lock.cellar) return s.called;
  if (s.called) return false;
  if (lock.door && !isOpen(s, lock.door)) return false; // the wing door is shut
  return true;
}

/** Which verbs could open this lock right now, and why not otherwise. */
export function available(s, lockId) {
  const lock = LOCKS[lockId];
  const none = (reason) => ({ pick: false, ring: false, force: false, reason });
  if (!lock) return none('no such lock');
  if (isOpen(s, lockId)) return none('already open');
  if (s.up) return none('the night is over');
  if (lock.cellar) { if (!s.called) return none('the cellar is shut'); }
  else if (s.called) return none('not tonight');
  if (lock.door && !isOpen(s, lock.door)) return none('the door is shut');
  const pick = lock.tool ? has(s, lock.tool) : true;
  return { pick, ring: true, force: s.teeth > 0, reason: pick ? null : `no ${lock.tool}` };
}

// ---- the locks --------------------------------------------------------------------------------------------
/** Open a lock with a verb. Throws on an illegal move so the simulator and the game both notice. */
export function open(s, lockId, verb) {
  const a = available(s, lockId);
  if (!VERBS.includes(verb)) throw new Error(`unknown verb ${verb}`);
  if (!a[verb]) throw new Error(`cannot ${verb} ${lockId}: ${a.reason || (verb === 'force' ? 'no teeth left' : 'not now')}`);
  const n = clone(s);
  n.opened[lockId] = verb;
  n.order.push(lockId);
  n.clock += MINUTES_PER_LOCK;
  if (verb === 'ring') n.favours.push({ lock: lockId, page: 'mine', paid: null });
  if (verb === 'force') { n.spent.push(lockId); n.teeth -= 1; }
  if (lockId === 'shutters') n.pell_down = true;                     // she comes down at the call either way
  if (!n.called && !LOCKS[lockId].cellar && locksOpened(n) >= LOCK_BUDGET) n.called = true;
  return n;
}

/** The hall bell with no lock in focus, "The cellar": the early call, one favour. */
export function callEarly(s) {
  if (s.called) throw new Error('the house has already called');
  const n = clone(s);
  n.favours.push({ lock: 'early', page: 'mine', paid: null });
  n.called = true; n.early = true;
  return n;
}

// ---- items ------------------------------------------------------------------------------------------------
/** Take an item from the container it lives in (the cupboard, the bag, the caddy, the doll's house, the cabinet). */
export function take(s, itemId) {
  const it = ITEMS[itemId];
  if (!it) throw new Error(`no such item ${itemId}`);
  if (s.items[itemId] !== 'away') throw new Error(`${itemId} is not there to take`);
  if (!it.from || !isOpen(s, it.from)) throw new Error(`${LOCKS[it.from]?.label || 'its lock'} is shut`);
  if (itemId === 'page' && !pageOffered(s)) throw new Error('the page is in the book now'); // her choice is made at the shutters
  const n = clone(s);
  n.items[itemId] = 'held';
  if (itemId === 'page') n.page_taken = true;
  return n;
}
export const takeKey = take;

/** Pell's choice is offered as the shutters open: before the call, or when the shutters were the seventh lock and nothing has been settled yet. */
export function pageOffered(s) {
  if (!isOpen(s, 'shutters') || s.items.page !== 'away') return false;
  if (!s.called) return true;
  return s.order[s.order.length - 1] === 'shutters' && !isOpen(s, 'cabinet') && !paidFavours(s).length && !onPell(s).length && !s.up;
}

/** Leave the lantern with a resident ("for when they come"). */
export function giveLantern(s, to = 'finch') {
  if (!RESIDENTS.includes(to)) throw new Error(`no such resident ${to}`);
  if (!has(s, 'lantern')) throw new Error('no lantern to give');
  if (to === 'finch' && s.finch_out) throw new Error('Mr. Finch is in the garden');
  const n = clone(s);
  n.items.lantern = 'given'; n.lantern_given = to;
  return n;
}

/** Use a resident's key on its owner, in the cellar. */
export function giveKey(s, itemId, resident) {
  const it = ITEMS[itemId];
  if (!it || !it.owner) throw new Error(`${itemId} is not a resident's key`);
  if (it.owner !== resident) throw new Error(`that is not ${resident}'s key`);
  if (!has(s, itemId)) throw new Error(`you do not hold ${itemId}`);
  if (!present(s, resident)) throw new Error(`${resident} is not here`);
  const n = clone(s);
  n.items[itemId] = 'given';
  return n;
}

/** Which residents are in the cellar for the settling. Finch never is. */
export function present(s, resident) {
  if (!s.called) return false;
  if (resident === 'pell') return s.pell_down;
  if (resident === 'wick') return s.wick_down;
  return false;
}

// ---- the residents' choices -------------------------------------------------------------------------------
export function letFinchOut(s) {
  if (!isOpen(s, 'garden')) throw new Error('the garden door is shut');
  if (s.finch_out) throw new Error('he has gone');
  const n = clone(s); n.finch_out = true; return n;
}
export function bringWickDown(s) {
  if (!isOpen(s, 'mock')) throw new Error('the mock door is shut');
  if (s.wick_down) throw new Error('he is coming');
  const n = clone(s); n.wick_down = true; return n;
}

// slice names, kept
export function takeLantern(s) { return take(s, 'lantern'); }
export function takeWrench(s) { return take(s, 'wrench'); }

// ---- the settling -----------------------------------------------------------------------------------------
/** A resident's key on the ledger: refused, it stays in your pocket (`react.pay.key`). */
export function isKey(itemId) { return !!ITEMS[itemId]?.owner; }

/** Can this item go on the ledger now? The page always can (it brings its own lines); anything else needs a line to pay. */
export function canPay(s, itemId) {
  if (!s.called || s.up) return false;
  if (isKey(itemId)) return false;
  if (!ITEMS[itemId]?.currency || !has(s, itemId)) return false;
  return itemId === 'page' || unpaid(s).length > 0;
}

/** Use an item on the ledger: Tallow writes "Paid." and the item goes into the furnace. The page adds her three lines first. */
export function pay(s, itemId) {
  if (!canPay(s, itemId)) throw new Error(`cannot pay with ${itemId}`);
  const n = clone(s);
  if (itemId === 'page') for (let i = 0; i < PELL_LINES; i++) n.favours.push({ lock: 'pell', page: 'mine', paid: null });
  const f = n.favours.find((x) => x.page === 'mine' && !x.paid);
  f.paid = itemId;
  n.items[itemId] = 'burned';
  return n;
}

/** Her offer stands while Pell's page is still in the book and there is a line of yours to move. */
export function canOffer(s) {
  return s.called && !s.up && !s.page_taken && unpaid(s).length > 0;
}

/** "Put one on her page": the oldest unpaid favour of yours moves to Miss Pell's page. */
export function moveToPell(s) {
  if (!canOffer(s)) throw new Error('Miss Pell has no room');
  const n = clone(s);
  const f = n.favours.find((x) => x.page === 'mine' && !x.paid);
  f.page = 'pell';
  return n;
}

/** The cellar stair: resident keys still in your pocket go back on their hooks; the clock runs on to midnight. */
export function goUp(s) {
  if (!s.called) throw new Error('the cellar is shut');
  if (s.up) throw new Error('already up');
  const n = clone(s);
  for (const id of ITEM_IDS) if (ITEMS[id].owner && n.items[id] === 'held') n.items[id] = 'hook';
  n.up = true;
  n.clock = 60 - CLOCK_START.m; // midnight
  return n;
}

/** Keys you carry that are not yours (the stair says `react.key.back`). */
export function keysHeld(s) { return ITEM_IDS.filter((id) => ITEMS[id].owner && has(s, id)); }

// ---- the door at midnight --------------------------------------------------------------------------------
export function doorOpens(s) { return unpaid(s).length === 0 && s.teeth >= DOOR_TEETH; }
export function pellOnStep(s) {
  return s.pell_down && s.page_taken && s.favours.some((f) => f.lock === 'pell') &&
    s.favours.filter((f) => f.lock === 'pell').every((f) => f.page === 'mine' && f.paid) && s.items.pellkey === 'given';
}
export function wickOnStep(s) { return s.wick_down && s.items.wickkey === 'given'; }

/** One of the seven ending ids, by GAME.md §8's precedence. */
export function ending(s) {
  if (unpaid(s).length) return 'staff';
  if (s.teeth < DOOR_TEETH) return 'teeth';
  if (onPell(s).length) return 'tally';
  if (wickOnStep(s) || pellOnStep(s)) return 'procession';
  if (s.finch_out) return 'finch';
  if (s.favours.length || s.spent.length) return 'paid';
  return 'clean';
}

/** The script key for the house's last line on the card. */
export function cardLine(s) {
  const e = ending(s);
  if (e === 'paid') return paidFavours(s).length ? 'card.paid' : 'card.paid.teeth';
  // "Three on the step" counts: you, and Mr. Wick and Miss Pell if they are on it with you
  if (e === 'procession') return 1 + (wickOnStep(s) ? 1 : 0) + (pellOnStep(s) ? 1 : 0) === 2 ? 'card.procession.two' : 'card.procession';
  return `card.${e}`;
}

/** Where everyone ends the night, in the card's words. */
export function places(s) {
  const opens = doorOpens(s);
  return {
    finch: s.finch_out ? 'by the van' : 'in his chair',
    // a resident given their key whose door did not open stays down with it (the teeth ending, a line unpaid)
    pell: !s.pell_down ? 'in the parlour' : opens && pellOnStep(s) ? 'on the step' : s.items.pellkey === 'given' ? 'in the cellar, with her key' : 'in the cellar',
    wick: !s.wick_down ? 'at his bench' : opens && wickOnStep(s) ? 'on the step' : s.items.wickkey === 'given' ? 'in the cellar, with his key' : 'in the cellar',
  };
}

export function lanternPlace(s) {
  const v = s.items.lantern;
  if (v === 'away') return 'in the cupboard';
  if (v === 'held') return 'kept';
  if (v === 'burned') return 'in the furnace';
  return { finch: 'with Mr. Finch', pell: 'with Miss Pell', wick: 'with Mr. Wick' }[s.lantern_given] || 'kept';
}

export function clockText(s) {
  let m = CLOCK_START.m + s.clock, h = CLOCK_START.h;
  while (m >= 60) { m -= 60; h += 1; }
  if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** The end record: what the memorial wall keeps of a night (night number and date are added by the store). */
export function record(s) {
  return {
    ending: ending(s),
    card: cardLine(s),
    teeth: s.teeth,
    favours: { paid: paidFavours(s).length, onPell: onPell(s).length, unpaid: unpaid(s).length },
    paidWith: paidFavours(s).map((f) => f.paid),
    lantern: lanternPlace(s),
    residents: places(s),
    opened: { ...s.opened },
    early: s.early,
    clock: clockText(s),
  };
}

/** Everything the player paid, in one object (the slice's summary, widened). */
export function summary(s) {
  return {
    teeth: s.teeth,
    teethSpent: s.spent.slice(),
    favours: s.favours.map((f) => ({ ...f })),
    lantern: lanternState(s),
    finch: s.finch_out ? 'garden' : 'chair',
    clock: clockText(s),
    opened: { ...s.opened },
    called: s.called,
    ending: ending(s),
    card: cardLine(s),
  };
}

function clone(s) {
  return {
    ...s,
    opened: { ...s.opened },
    order: s.order.slice(),
    favours: s.favours.map((f) => ({ ...f })),
    spent: s.spent.slice(),
    items: { ...s.items },
  };
}

/** Bring an older save (the slice's shape) up to this one. */
export function migrate(s) {
  if (!s || typeof s !== 'object') return initial();
  if (s.items && s.order) return s;
  const n = initial();
  n.opened = { ...(s.opened || {}) };
  n.order = Object.keys(n.opened);
  n.favours = (s.favours || []).map((f) => (typeof f === 'string' ? { lock: f, page: 'mine', paid: null } : f));
  n.spent = (s.spent || []).slice();
  n.teeth = typeof s.teeth === 'number' ? s.teeth : TEETH;
  n.clock = n.order.length * MINUTES_PER_LOCK;
  if (s.lantern === 'carried') n.items.lantern = 'held';
  if (s.lantern === 'given') { n.items.lantern = 'given'; n.lantern_given = 'finch'; }
  if (s.wrench) n.items.wrench = 'held';
  if (s.finch === 'garden') n.finch_out = true;
  return n;
}
