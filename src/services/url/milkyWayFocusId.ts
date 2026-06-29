/**
 * MILKY_WAY_FOCUS_ID — the durable `#focus=<id>` body for the Milky Way singleton.
 *
 * The Milky Way has no catalogued objID and no `${category}-${seed}` token; it's
 * a singleton, so its deep-link is a fixed literal. This is the one canonical
 * home for that literal: the decoder (resolveFocusId) and both encoders
 * (focusIdOf, urlHashFor) import it so the round-trip can't drift — change the
 * spelling here and every side moves together.
 *
 * It happens to match the SelectionRef union tag `'milkyWay'`, but the two are
 * independent facts (one is the URL wire format, the other the in-memory
 * discriminant); they share a home only by intent, not by coincidence-coupling.
 */

export const MILKY_WAY_FOCUS_ID = 'milkyWay';
