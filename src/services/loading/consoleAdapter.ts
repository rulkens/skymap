/**
 * consoleAdapterFor(name) — returns a `(prev, next) => void` subscriber that
 * logs structured `[loading] <name> <transition>` lines on meaningful state
 * changes.  Per-chunk bytes progress is intentionally not logged — it drives
 * the loading-bar UI via the slot's state, and logging it floods the console
 * on every page load with no operator value.
 *
 * The adapter is "pure" in the I/O sense — same inputs always produce the
 * same console call (modulo the throttle's elapsed-ms argument, which is
 * the only impurity, and is necessary).  The design of the loading
 * subsystem auto-attaches one adapter per slot at creation; consumers
 * don't have to remember to subscribe.
 *
 * Verbosity:
 *   - load-started, ready, retry-scheduled  → console.log (info)
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
import type { LoadState } from '../../@types/loading/LoadState';

export function consoleAdapterFor(name: string): (
  prev: LoadState<unknown>,
  next: LoadState<unknown>,
) => void {
  const dev = !!import.meta.env.DEV;

  return (prev, next) => {
    // Transition into loading from a non-loading state.
    if (prev.kind !== 'loading' && next.kind === 'loading') {
      if (dev) console.log(`[loading] ${name} load-started`, { req: next.req });
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
