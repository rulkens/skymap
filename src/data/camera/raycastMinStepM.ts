/** Step floor for `raycastTerrain`'s forward march. `f(t)/closingRate` can
 *  shrink toward zero without ever crossing (an asymptotic approach rather
 *  than a hit), which would stall the sample budget short of the terrain;
 *  this guarantees forward progress every iteration. */
export const RAYCAST_MIN_STEP_M = 1;
