/**
 * isNearStar — the near/far partition predicate for the seeded scene stars.
 *
 * A star renders two ways: near-partition stars resolve to true-scale
 * foreground spheres (`starSpheresLayer` → `starRenderer`); far-partition
 * stars stay additive HDR points (`starPointsLayer` → `starPointRenderer`).
 * This predicate is the ONE home of that split — both layers and the
 * `initGpu` far-star upload call it (the far side is always `!isNearStar`),
 * so the near/far complement can't drift between consumers the way two
 * hand-inlined `<` / `>=` comparisons against a shared constant could.
 *
 * The threshold is a fixed distance, NOT an apparent-size LOD: one parsec,
 * chosen so the Sun (distance 0 — the heliocentric frame's origin) is the
 * only near star, while the nearest real neighbour (Proxima Centauri,
 * ~1.301 pc) and everything beyond stay points. The full point↔sphere
 * promotion driven by on-screen size is Plan 03; when it lands it replaces
 * this predicate rather than parameterising it.
 *
 * Distance is measured from the heliocentric origin — the same frame every
 * `positionMpc` is authored in — so `|positionMpc|` IS the star's distance
 * from the Sun, and no camera or render-origin state enters the partition.
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
