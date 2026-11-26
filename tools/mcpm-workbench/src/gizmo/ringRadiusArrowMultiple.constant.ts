/** Rotate-ring radius, as a multiple of `arrowLengthMpc` — the SAME constant-screen-size
 *  length the translate arrows use, NOT a fraction of half-extent: a box-scaled ring would
 *  swallow a tiny box or vanish off-screen on a huge one. 1.3 sits the rings OUTSIDE the
 *  arrow tips, so the two handle families read apart. */
export const RING_RADIUS_ARROW_MULTIPLE = 1.3;
