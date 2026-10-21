/**
 * The smallest node-row run a chunk takes in an octree pool, and the page the cut's live-row
 * table counts in. Chunk rows sit near the 2,048-row bound (GLADE p50 1,373), so the page only
 * matters for small chunks; the table costs one u32 per page.
 */
export const OCTREE_MIN_NODE_RUN = 64;
