/** createSyncThenLoad's handles: start a sync (and what follows it), or pause the running one. */
export type SyncThenLoad = {
  syncThenLoad: (restart: boolean) => Promise<void>;
  pause: () => void;
};
