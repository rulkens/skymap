/** The coarsest height level every body bakes: the march never reads, nor bounds, above it. */
export const HORIZON_MARCH_COARSEST_LEVEL = 3;

/** A step is a 24th of the distance marched so far (and never under one post), so the far
 *  field takes few, coarse reads. The spike's value, matched against March 32/64. */
export const HORIZON_MARCH_STEP_DIVISOR = 24;
