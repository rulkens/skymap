/**
 * ms for a star-octree node's LOD fade to travel 0→1 (or 1→0); linear, not
 * eased — luminance is linear in opacity, so a linear cross-dissolve conserves flux.
 */
export const NODE_FADE_MS = 250;

/** Longest frame gap a fade step counts: a slept render loop must not pop every node. */
export const NODE_FADE_MAX_DT_MS = 50;
