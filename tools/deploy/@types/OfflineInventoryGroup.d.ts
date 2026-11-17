import type { OfflineInventoryFile } from './OfflineInventoryFile';

/** One sync group of the offline inventory: its label and every file it mirrors. */
export type OfflineInventoryGroup = { label: string; files: OfflineInventoryFile[] };
