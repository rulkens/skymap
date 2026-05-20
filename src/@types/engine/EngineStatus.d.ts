/**
 * EngineStatus — discriminated union reported by the engine during startup
 * and steady-state. React components switch on the `kind` field to render
 * the correct status text or error message.
 */

import type { SourceType } from '../data/Source';

/**
 * Status reported during engine startup and steady-state.
 *
 * A discriminated union (`kind` field) lets React components switch on the
 * status and render the correct text without carrying extra nullable fields.
 *
 *   initializing  → GPU bootstrap in progress (before fetch starts)
 *   loading       → fetch /data/sdss.bin in progress
 *   ready         → rendering is live; `count` and `source` are set
 *   error         → GPU or fatal load error; `message` carries the detail
 *
 * `source` is the `Source` enum value of the catalog that just became
 * ready — the only consumer (the StatusBar) compares it against
 * `Source.Synthetic` to flag the no-real-data fallback path.
 */
export type EngineStatus =
  | { kind: 'initializing' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      count: number;
      source: SourceType;
    }
  | { kind: 'error'; message: string };
