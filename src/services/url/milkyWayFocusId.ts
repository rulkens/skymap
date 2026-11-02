/**
 * MILKY_WAY_FOCUS_ID — the durable `#focus=<id>` body for the Milky Way singleton
 * (it has no catalogued objID or `${category}-${seed}` token). The one canonical
 * home for that literal: the Milky Way row's `focusId` encode and decode
 * both import it, so the round-trip can't drift. It happens to
 * match the `SelectionRef` union tag `'milkyWay'` by intent, not by coupling.
 */

export const MILKY_WAY_FOCUS_ID = 'milkyWay';
