/** Bisection refinement ceiling once `raycastTerrain` has bracketed the first
 *  `+ → −` crossing (spec §8.1). An exhausted budget answers with its best
 *  bracket rather than `null` — a march that found the crossing but not yet
 *  to `toleranceM` is still a hit. */
export const RAYCAST_BISECTION_ITERATION_CAP = 24;
