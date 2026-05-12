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
