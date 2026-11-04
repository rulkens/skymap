import type { SyncProgress } from '../../../@types/SyncProgress';

/** runSync's input: the data host, the mirror on disk, and where progress goes. */
export type SyncRequest = {
  baseUrl: string;
  dataRoot: string;
  onProgress: (progress: SyncProgress) => void;
};
