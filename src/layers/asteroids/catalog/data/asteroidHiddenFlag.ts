/**
 * Set at decode in the flags byte (bit 7, always zero on disk) on the mesh-drawn numbers and the ABSENT
 * placeholder rows: the one bit every draw, pick and search cull reads.
 */
export const ASTEROID_HIDDEN_FLAG = 1 << 7;
