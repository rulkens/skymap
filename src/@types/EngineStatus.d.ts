/**
 * EngineStatus — discriminated union reported by the engine during startup
 * and steady-state. React components switch on the `kind` field to render
 * the correct status text or error message.
 */

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
 */
export type EngineStatus =
  | { kind: 'initializing' }
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; source: 'sdss.bin' | '2mrs.bin' | 'glade.bin' | 'synthetic' }
  | { kind: 'error'; message: string };
