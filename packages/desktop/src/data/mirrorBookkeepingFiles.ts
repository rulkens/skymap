/** Files the mirror keeps beside the bucket's `data/` tree; never pruned, never orphans. */
export const MIRROR_BOOKKEEPING_FILES = ['synced.json', 'inventory.json'] as const;
