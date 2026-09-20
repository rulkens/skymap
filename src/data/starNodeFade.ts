/**
 * NODE_FADE_MS — ms for a star-octree node's LOD fade to travel 0→1 (or 1→0).
 * Linear, not eased: a record's screen luminance is linear in opacity, so a
 * complementary linear split/merge fade conserves total flux exactly
 * (`parentFlux·(1−t) + childrenFlux·t = F`); an eased ramp would momentarily
 * mis-count.
 */
export const NODE_FADE_MS = 250;
