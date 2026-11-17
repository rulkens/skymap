import type { SyncOutcome } from '../../sync/@types/SyncOutcome';

/** What the outcome table reads: the sync's end, the data on disk, and the sky as it was. */
export type SyncOutcomeFacts = {
  outcome: SyncOutcome;
  hasData: boolean;
  skyRunning: boolean;
  /** The running sky still waits for Restart sky from an earlier sync. */
  skyStale: boolean;
  /** A launch or daily sync, which reloads the sky; Update now leaves it for Restart sky. */
  restart: boolean;
};
