/**
 * Events that drive the LoadState reducer.  Every state transition is
 * expressible as one of these.
 *
 * Why an explicit event type rather than the slot calling `setState` directly?
 * The reducer becomes pure and exhaustively testable — every event from
 * every state can be enumerated in a table-driven test.  The slot's stateful
 * loop just dispatches events; the actual transition logic lives in
 * `reduceLoadState.ts`.
 */
export type LoadEvent =
  | { kind: 'load-started'; req: unknown }
  | { kind: 'bytes'; loaded: number; total: number }
  | { kind: 'fetch-succeeded' }
  | { kind: 'committing' }
  | { kind: 'committed'; value: unknown; nowMs: number }
  | { kind: 'retry-scheduled'; attempt: number }
  | { kind: 'gave-up'; error: Error; attempt: number };
