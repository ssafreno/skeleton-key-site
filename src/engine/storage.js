// Save slots for parallel testers: `?slot=<name>` namespaces every localStorage key the game uses (the save, the
// memorial, settings) so two tabs on the same origin never share a night. The slot is remembered for the tab in
// sessionStorage, so a reload, `?keep`, the card's "Same night next year" and a URL without the flag stay in it.
// `?slot=` with an empty value (or `?slot=default`) goes back to the shared, unnamespaced keys.
const SLOT_SESSION_KEY = 'skeleton-key.slot';

function readSlot() {
  let slot = null;
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('slot')) {
      const v = (q.get('slot') || '').trim().replace(/[^\w.-]/g, '').slice(0, 40);
      slot = v && v !== 'default' ? v : null;
      try { if (slot) sessionStorage.setItem(SLOT_SESSION_KEY, slot); else sessionStorage.removeItem(SLOT_SESSION_KEY); } catch (e) { /* ignore */ }
      return slot;
    }
  } catch (e) { /* no location (node) */ }
  try { slot = sessionStorage.getItem(SLOT_SESSION_KEY) || null; } catch (e) { /* ignore */ }
  return slot;
}

/** The tab's save slot, or null for the shared keys. */
export const SLOT = readSlot();

/** A localStorage key in this tab's slot: 'skeleton-key.save.v1' → 'skeleton-key.save.v1@eng2'. */
export function storeKey(base) { return SLOT ? `${base}@${SLOT}` : base; }

/** localStorage, namespaced by slot, never throwing. */
export const store = {
  get(base) { try { return localStorage.getItem(storeKey(base)); } catch (e) { return null; } },
  set(base, v) { try { localStorage.setItem(storeKey(base), v); } catch (e) { /* storage blocked */ } },
  remove(base) { try { localStorage.removeItem(storeKey(base)); } catch (e) { /* ignore */ } },
};
