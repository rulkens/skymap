/** How a sync ended; `unchanged` downloaded nothing against the same inventory, so the sky needs no reload. */
export type SyncOutcome =
  | { kind: 'synced' }
  | { kind: 'unchanged' }
  | { kind: 'offline' }
  | { kind: 'failed' }
  | { kind: 'diskFull'; neededBytes: number; freeBytes: number };
