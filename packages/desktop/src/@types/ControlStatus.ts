/** What the control window's sync panel says; `ready` is a finished sync the running sky has not loaded. */
export type ControlStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'ready' }
  | { kind: 'offline'; hasData: boolean }
  | { kind: 'failed'; hasData: boolean }
  | { kind: 'diskFull'; neededBytes: number; freeBytes: number };
