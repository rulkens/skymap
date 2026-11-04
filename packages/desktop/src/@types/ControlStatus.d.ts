/**
 * What the last or running sync means for the control window. `complete` is a finished sync whose
 * data the sky has or is loading; `ready` is new data the running sky waits to load on Restart sky.
 */
export type ControlStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'complete' }
  | { kind: 'ready' }
  | { kind: 'offline' }
  | { kind: 'failed' }
  | { kind: 'diskFull'; neededBytes: number; freeBytes: number };
