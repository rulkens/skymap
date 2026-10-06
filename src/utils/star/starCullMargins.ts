import {
  STAR_SIZE_REF_PX,
  STAR_GLOW_MIN_PX,
  STAR_PICK_MIN_RADIUS_PX,
} from '../../data/starCullSlack';

/**
 * Angular cull slack (radians per unit camera distance) for a leaf's cull
 * sphere: a leaf draws as a fixed-PIXEL dot, so a box whose CENTRE has just
 * crossed a clip plane can still paint pixels. `pick` floors the glow radius
 * at `STAR_PICK_MIN_RADIUS_PX` first — the pick pass stamps a bigger footprint
 * than the visual dot, so the one cut keeps what either can paint.
 * Mutated scratch, read synchronously — allocation-free on the draw hot path.
 */
const marginScratch = { pick: 0 };

export function starCullMargins(sizePx: number, pxPerRad: number): typeof marginScratch {
  const leafPxRadius = STAR_GLOW_MIN_PX * (sizePx / STAR_SIZE_REF_PX);
  marginScratch.pick = Math.max(leafPxRadius, STAR_PICK_MIN_RADIUS_PX) / pxPerRad;
  return marginScratch;
}
