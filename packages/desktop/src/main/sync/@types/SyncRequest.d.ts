import type { SyncProgress } from '../../../@types/SyncProgress';

/** runSync's input: the data host, the mirror on disk, what pauses it, and where progress goes. */
export type SyncRequest = {
  baseUrl: string;
  dataRoot: string;
  signal: AbortSignal;
  onProgress: (progress: SyncProgress) => void;
};
