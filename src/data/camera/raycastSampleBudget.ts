/** Forward-marching sample ceiling for `raycastTerrain`. Sized against
 *  `(t1-t0)/RAYCAST_SAMPLE_BUDGET`, the per-step lateral cap, so a grazing
 *  ray (chord ~670 km on Earth) still resolves in a bounded number of
 *  `groundRadiusAtM` calls — the cost the perf gate watches. */
export const RAYCAST_SAMPLE_BUDGET = 64;
