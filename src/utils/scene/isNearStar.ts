/**
 * isNearStar — the camera-free bootstrap seed for the star-points upload.
 *
 * The PER-FRAME point↔sphere split lives in `partitionStarsByResolution`
 * (apparent-size driven; both star layers consume it), and the points layer
 * re-uploads the instance buffer whenever that partition changes. This
 * predicate remains only as `initGpu`'s initial `setStars` seed — the
 * pre-first-frame upload made before any camera pose exists to project an
 * apparent size from.
 *
 * The threshold is a fixed distance: one parsec, chosen so the Sun
 * (distance 0 — the heliocentric frame's origin) is the only near star,
 * while the nearest real neighbour (Proxima Centauri, ~1.301 pc) and
 * everything beyond seed as points. The camera boots at galaxy scale, where
 * the apparent-size partition agrees with this seed exactly (every non-Sun
 * star is sub-pixel); the layer's first draw re-uploads from the live
 * partition regardless (its fingerprint cache starts empty), so the seed
 * only covers the window before the first frame.
 *
 * Distance is measured from the heliocentric origin — the same frame every
 * `positionMpc` is authored in — so `|positionMpc|` IS the star's distance
 * from the Sun, and no camera or render-origin state enters the seed.
 */

import type { StarBody } from '../../@types/scene/StarBody';
import { SCALE_UNITS } from '../../data/scaleUnits';

/**
 * Stars closer than this resolve to foreground spheres; everything at or
 * beyond it renders as an additive point. One parsec: only the Sun
 * (distance 0) falls inside — Proxima Centauri (~1.301 pc) is the nearest
 * star that must stay a point.
 */
const NEAR_STAR_MAX_DISTANCE_MPC = 1 * SCALE_UNITS.PC_TO_MPC;

/** True when `star` belongs to the near partition (a resolved sphere). */
export function isNearStar(star: StarBody): boolean {
  const p = star.positionMpc;
  return Math.hypot(p[0], p[1], p[2]) < NEAR_STAR_MAX_DISTANCE_MPC;
}
