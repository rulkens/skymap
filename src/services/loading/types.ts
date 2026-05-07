/**
 * Shared type vocabulary for the asset-loading subsystem.
 *
 * The design pushes nearly all logic into pure functions; the only mutable
 * state lives inside `AssetSlot.ts`.  This file defines the contracts those
 * pure helpers and the slot all share.
 *
 * Why a single types.ts (rather than per-module type files)?  Loading types
 * are tightly coupled — a `LoadEvent` is consumed by the reducer, the
 * AssetSlot, and the registry; splitting them up would force three import
 * cycles for what is essentially one cohesive contract.  When the contract
 * grows (e.g. adding a `committed-with-warnings` state), the diff is
 * localised here.
 */

/**
 * The lifecycle state of one asset.
 *
 * `idle` is the only state where the slot has never been asked to load.
 * Once any `load()` is called, the state becomes `loading` and never returns
 * to `idle` (a successful load → `ready`, a final failure → `error`, but
 * neither path goes back to `idle`).  This is intentional — UI consumers can
 * treat `idle` as "first paint, nothing requested yet" without the ambiguity
 * of "did I just go idle because of an abort or because I haven't started?".
 */
export type LoadState<T> =
  | { kind: 'idle' }
  | { kind: 'loading'; req: unknown; loaded: number; total: number; attempt: number }
  | { kind: 'committing'; req: unknown }
  | { kind: 'ready'; req: unknown; value: T; loadedAtMs: number }
  | { kind: 'error'; req: unknown; error: Error; finalAttempt: number };

/**
 * One asset's fetcher: pure async function from a typed request to the
 * decoded payload.  Receives an AbortSignal (so the slot can supersede
 * in-flight fetches) and a progress callback (so the slot can mirror byte
 * counts into LoadState).
 *
 * Generic over both T (payload) and Req (request) so the typechecker
 * catches mistakes like calling a sidecar slot with a tier-bearing request.
 */
export type Fetcher<T, Req> = (
  req: Req,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
) => Promise<T>;

/**
 * Optional commit step run after fetch+decode succeeds.  For point-cloud
 * slots this uploads to the GPU; for sidecar slots it's omitted.
 *
 * Receives the same AbortSignal as the fetch so a long-running GPU upload
 * can be aborted by a superseding `load()` (the slot's second race-check
 * still applies even if commit happens to ignore the signal — the check is
 * the structural fix, the signal is the cooperative one).
 */
export type Committer<T> = (value: T, signal: AbortSignal) => Promise<void>;

/**
 * Retry policy decision.  `give-up` ends the retry loop; `{delayMs}` schedules
 * the next attempt after sleeping the indicated milliseconds.
 *
 * Pure function `(attempt, error) → decision`.  No mutable state, no clock
 * reads, no I/O — a property of the inputs only.  This makes the policy
 * trivially testable across status codes and attempt counts.
 */
export type RetryDecision = { delayMs: number } | 'give-up';
export type RetryPolicy = (attempt: number, error: Error) => RetryDecision;

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

/**
 * The handle returned by `createAssetSlot`.  This is the public API every
 * consumer of the loading subsystem talks to.
 */
export type AssetSlot<T, Req> = {
  readonly name: string;
  load(req: Req): void;
  current(): T | null;
  state(): LoadState<T>;
  subscribe(fn: (state: LoadState<T>) => void): () => void;
  forceReload(): void;
  cancel(): void;
};
