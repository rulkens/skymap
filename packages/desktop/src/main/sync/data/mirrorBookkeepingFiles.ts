import { INVENTORY_FILE } from './inventoryFile';
import { SYNCED_FILE } from './syncedFile';

/** Files the mirror keeps beside the bucket's `data/` tree; never pruned, never orphans. */
export const MIRROR_BOOKKEEPING_FILES = [SYNCED_FILE, INVENTORY_FILE] as const;
