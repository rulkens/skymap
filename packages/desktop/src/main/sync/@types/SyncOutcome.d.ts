import type { SyncFailure } from '../../../@types/SyncFailure';

/**
 * How a sync ended; `unchanged` downloaded nothing against the same inventory, so the sky needs no
 * reload, and `paused` was stopped from the control window, keeping the files that finished.
 */
export type SyncOutcome =
  | { kind: 'synced' }
  | { kind: 'unchanged' }
  | { kind: 'paused' }
  | { kind: 'offline' }
  | { kind: 'failed'; failure: SyncFailure }
  | { kind: 'diskFull'; neededBytes: number; freeBytes: number };
