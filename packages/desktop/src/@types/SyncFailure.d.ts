/**
 * Why a sync failed, for the person at the control window: `noList` is a missing or unreadable
 * download list, `stale` a file the list names that the server no longer holds as listed (a deploy
 * landed, so Retry waits on it), `error` anything else. `key` is the file, null when none is to blame.
 */
export type SyncFailure = {
  reason: 'noList' | 'stale' | 'error';
  key: string | null;
  detail: string;
};
