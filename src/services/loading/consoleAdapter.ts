/**
 * consoleAdapterFor(name) — returns a `(prev, next) => void` subscriber that
 * logs structured `[loading] <name> <transition>` lines on meaningful state
 * changes.  Bytes-progress events are throttled (1 per 250ms) so a fast
 * 100 MB fetch doesn't flood the console.
 *
 * The adapter is "pure" in the I/O sense — same inputs always produce the
 * same console call (modulo the throttle's elapsed-ms argument, which is
 * the only impurity, and is necessary).  The design of the loading
 * subsystem auto-attaches one adapter per slot at creation; consumers
 * don't have to remember to subscribe.
 *
 * Verbosity:
 *   - load-started, ready, retry-scheduled  → console.log (info)
 *   - throttled bytes                       → console.log (info)
 *   - error                                 → console.warn (always)
 *
 * In production builds, `import.meta.env.DEV === false` silences the info
 * lines; warnings are always visible (operators want to see real failures).
 *
 * Why `(prev, next)` instead of just `(next)`?  Several transitions can
 * only be detected by comparing two states (e.g. `loading.attempt` changing
 * means a retry was scheduled).  Computing `prev` inside the slot by closing
 * over a local mutable cell is the natural place — see AssetSlot's
 * subscriber bridge for the closure that does that.
 */
import type { LoadState } from './types';

const BYTES_LOG_INTERVAL_MS = 250;

export function consoleAdapterFor(name: string): (
  prev: LoadState<unknown>,
  next: LoadState<unknown>,
) => void {
  let lastBytesLogMs = 0;
  const dev = !!import.meta.env.DEV;

  return (prev, next) => {
    // Transition into loading from a non-loading state.
    if (prev.kind !== 'loading' && next.kind === 'loading') {
      if (dev) console.log(`[loading] ${name} load-started`, { req: next.req });
      return;
    }
    // Bytes progress within loading — throttled.
    if (prev.kind === 'loading' && next.kind === 'loading' && prev.loaded !== next.loaded) {
      const now = Date.now();
      if (now - lastBytesLogMs >= BYTES_LOG_INTERVAL_MS) {
        lastBytesLogMs = now;
        if (dev) {
          const pct = next.total > 0 ? Math.round((next.loaded / next.total) * 100) : 0;
          console.log(
            `[loading] ${name} bytes ${pct}% (${next.loaded}/${next.total})`,
            { attempt: next.attempt },
          );
        }
      }
      return;
    }
    // Retry scheduled.
    if (prev.kind === 'loading' && next.kind === 'loading' && prev.attempt !== next.attempt) {
      if (dev) console.log(`[loading] ${name} retry-scheduled`, { attempt: next.attempt });
      return;
    }
    // Ready.
    if (next.kind === 'ready' && prev.kind !== 'ready') {
      if (dev) console.log(`[loading] ${name} ready`, { loadedAtMs: next.loadedAtMs });
      return;
    }
    // Error.
    if (next.kind === 'error' && prev.kind !== 'error') {
      console.warn(`[loading] ${name} error`, {
        message: next.error.message,
        finalAttempt: next.finalAttempt,
      });
    }
  };
}
