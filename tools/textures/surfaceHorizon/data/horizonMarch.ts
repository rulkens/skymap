export const HORIZON_MARCH_COARSEST_LEVEL = 3;

// Steps are a 24th of the distance so far, never under a post: the spike's value.
export const HORIZON_MARCH_STEP_DIVISOR = 24;

// The arc `marchCeilingM`'s z3 ring surely covers (≥ 31° where a polar row starts); real marches end by ~12°.
export const HORIZON_MARCH_MAX_ARC_RAD = (30 * Math.PI) / 180;
