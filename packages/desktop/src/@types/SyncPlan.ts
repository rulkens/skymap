import type { OfflineInventoryFile } from '../../../../tools/deploy/@types/OfflineInventoryFile.js';

export type SyncPlan = {
  groups: { label: string; download: OfflineInventoryFile[] }[];
  downloadBytes: number;
};
