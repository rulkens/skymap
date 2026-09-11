/**
 * overflowFade — alpha for an overlay that POINTS AT a subject (the NEAR0
 * selection ring, a body's lifted caption), faded out once the subject has
 * grown too big on screen for pointing at it to mean anything.
 *
 * One band over the SUBJECT's apparent diameter serves both, since both are
 * sized at the same 1.5× of it (`near0RingRadiusPx`, `LEADER_LIFT_FACTOR`): a
 * stray arc crossing a screen edge and a caption lifted past the top are one
 * event. It keys on the viewport's SHORT side — the first edge 1.5× reaches.
 */

import { fadeBand } from '../math/fadeBand';

/** Subject diameter, as a fraction of the short side, at which the overlay
 *  first touches it — and the diameter by which it has fully dissolved. */
const FULL_AT_FRACTION = 1 / 1.5;
const GONE_AT_FRACTION = 1.25 / 1.5;

export function overflowFade(apparentDiameterPx: number, viewportShortSidePx: number): number {
  return fadeBand(
    {
      fullAt: viewportShortSidePx * FULL_AT_FRACTION,
      goneAt: viewportShortSidePx * GONE_AT_FRACTION,
    },
    apparentDiameterPx,
  );
}
