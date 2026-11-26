/** Rotate-ring radius, as a fraction of `arrowLengthMpc` — the SAME constant-screen-size
 *  length the translate arrows use, NOT a fraction of half-extent (spec §5's original
 *  sizing). RULING (supersedes spec §5, same reasoning as F1.11's arrow-length change): a
 *  box-scaled ring would swallow a tiny box or vanish off-screen on a huge one — the exact
 *  problem F1.11 fixed for the arrows. 1.3 (revised from an initial 0.8) sits the rings
 *  OUTSIDE the arrow tips — clear visual separation between the two handle families, at
 *  maintainer request. */
export const RING_RADIUS_ARROW_MULTIPLE = 1.3;
