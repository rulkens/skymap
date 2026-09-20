import {
  STAR_SIZE_REF_PX,
  STAR_GLOW_MIN_PX,
  STAR_PICK_MIN_RADIUS_PX,
} from '../../data/starCullSlack';

/**
 * Derive the per-frame angular cull slack (radians per unit camera distance) for
 * the leaf cull sphere — the `glowMarginAngleRad` the renderers add as
 * `length(center) · margin` (see `StarCatalogDrawArgs.glowMarginAngleRad`). A
 * leaf draws as a fixed-PIXEL dot, so its world footprint grows with distance; a
 * node whose box CENTRE has just crossed a clip plane can still paint on-screen
 * pixels, and the slack keeps it.
 *
 *   - `radiansPerPx = fovYRad / viewportHeightPx` — the angle one vertical
 *     pixel subtends at the LIVE camera FOV, the exact conversion the vertex
 *     stage's pixel-size-to-clip math inverts.
 *   - `leafPxRadius = STAR_GLOW_MIN_PX · (sizePx / STAR_SIZE_REF_PX)` — the dot's
 *     glow radius in pixels, scaled by the user's dot size relative to the
 *     shader's reference size (`STAR_SIZE_REF_PX`, the WESL divisor twin —
 *     independent of `DEFAULT_STAR_SIZE_PX`, which only seeds the slider).
 *
 * Two margins because the pick pass inflates every leaf to the 3.5 px clickable
 * floor: `pick` floors `leafPxRadius` at `STAR_PICK_MIN_RADIUS_PX` BEFORE the
 * radians conversion, so `max(a,b)·radiansPerPx` covers the larger of the two
 * footprints. Conservative round-up is fine — this is slack, not photometry.
 *
 * Returns a mutated module-level scratch (read synchronously by the caller before
 * any other call) rather than a fresh object — allocation-free on the per-draw
 * hot path; `drawStarStream` and `drawStarPick` each call this once per draw and
 * consume the result immediately.
 */
const marginScratch = { leaf: 0, pick: 0 };

export function starCullMargins(
  sizePx: number,
  viewportHeightPx: number,
  fovYRad: number,
): typeof marginScratch {
  const radiansPerPx = fovYRad / viewportHeightPx;
  const leafPxRadius = STAR_GLOW_MIN_PX * (sizePx / STAR_SIZE_REF_PX);
  marginScratch.leaf = leafPxRadius * radiansPerPx;
  marginScratch.pick = Math.max(leafPxRadius, STAR_PICK_MIN_RADIUS_PX) * radiansPerPx;
  return marginScratch;
}
