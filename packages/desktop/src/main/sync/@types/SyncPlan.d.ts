import type { OfflineInventoryFile } from '../../../../../../tools/deploy/@types/OfflineInventoryFile';

export type SyncPlan = {
  groups: { download: OfflineInventoryFile[] }[];
  downloadBytes: number;
};
