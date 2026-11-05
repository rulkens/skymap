/**
 * The smallest record run a chunk takes in an octree pool. GLADE's chunks run p10 1,513 /
 * p50 2,169 records, so 1,024-record pages fill ~0.9 at the small end; smaller pages only
 * lengthen the allocator's free lists.
 */
export const OCTREE_MIN_RUN_RECORDS = 1024;
