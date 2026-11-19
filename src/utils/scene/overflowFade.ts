/**
 * overflowFade — alpha for an overlay that POINTS AT a subject (the NEAR0
 * selection ring, a body's lifted caption), faded out once the subject has
 * grown too big on screen for pointing at it to mean anything.
 *
 * One band over the SUBJECT's apparent diameter serves both, since both are
 * sized at the same 1.5× of it (`near0RingRadiusPx`, a caption's 3-radii lift): a
 * stray arc crossing a screen edge and a caption lifted past the top are one
 * event. It keys on the viewport's SHORT side — the first edge 1.5× reaches.
 */

import type { FadeBand } from '../../@types/math/FadeBand';
import { fadeBand } from '../math/fadeBand';

/** Subject diameter, as a fraction of the short side, at which the overlay
 *  first touches it — and the diameter by which it has fully dissolved. */
const FULL_AT_FRACTION = 1 / 1.5;
const GONE_AT_FRACTION = 1.25 / 1.5;

// Reused: the edges scale with the viewport, and this runs per label per frame.
const band: FadeBand = { fullAt: 0, goneAt: 0 };

export function overflowFade(apparentDiameterPx: number, viewportShortSidePx: number): number {
  band.fullAt = viewportShortSidePx * FULL_AT_FRACTION;
  band.goneAt = viewportShortSidePx * GONE_AT_FRACTION;
  return fadeBand(band, apparentDiameterPx);
}
