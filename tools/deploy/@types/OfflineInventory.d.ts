import type { OfflineInventoryFile } from './OfflineInventoryFile';

export type OfflineInventory = { groups: { label: string; files: OfflineInventoryFile[] }[] };
