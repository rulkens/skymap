/** Samples held back from `RAYCAST_SAMPLE_BUDGET` when sizing the per-step
 *  lateral cap. Without it the cap is `(t1-t0)/BUDGET`, so traversing the whole
 *  bracket costs the whole budget and any terrain that slows the march tips it
 *  into an exhausted-budget answer — measured at 63 samples for a plain nadir
 *  pick and 64 at the inner bound, i.e. no margin at all. */
export const RAYCAST_STEP_CAP_HEADROOM = 8;
