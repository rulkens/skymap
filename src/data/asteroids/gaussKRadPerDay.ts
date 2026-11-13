/**
 * The Gaussian gravitational constant k in rad/day: two-body mean motion is n = k·a^−1.5 with a in AU.
 * The bake (propagating stray epochs) and the Layer (advancing M) must use the same value, or a
 * propagated row lands somewhere the runtime would not have put it.
 */
export const GAUSS_K_RAD_PER_DAY = 0.01720209895;
