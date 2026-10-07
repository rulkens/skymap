import { SCALE_UNITS } from './scaleUnits';

/**
 * ms for a star-octree node's LOD fade to travel 0→1 (or 1→0); linear, not
 * eased — luminance is linear in opacity, so a linear cross-dissolve conserves flux.
 */
export const NODE_FADE_MS = 250;

/** Longest frame gap a fade step counts: a slept render loop must not pop every node. */
export const NODE_FADE_MAX_DT_MS = 50;

/**
 * Eye travel (Mpc) that counts as a new cut: 1e-4 pc, five orders under the
 * 23 pc leaf cell edge that LOD refinement measures distance against, yet far
 * above the ~1e-14 pc per-frame f64 creep of a camera riding a moving body.
 */
export const EYE_SLACK_MPC = 1e-4 * SCALE_UNITS.PC_TO_MPC;

/**
 * Largest coefficient change in a cut's unit-normal frustum planes that still
 * counts as the same cut: 1e-3 is ~0.06 degrees of turn, far above f32 rebase
 * jitter (~1e-7) and far below any deliberate camera move.
 */
export const PLANE_SLACK = 1e-3;
