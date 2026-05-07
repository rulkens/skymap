/**
 * reduceLoadState — pure state reducer for an AssetSlot.
 *
 * Every state transition the slot can make is expressible as one of the
 * LoadEvent variants, and the result is a property of `(state, event)`
 * alone — no clock reads, no I/O, no closure-captured state.  The slot's
 * stateful loop dispatches events through this function and notifies
 * subscribers with the new state.
 *
 * Invariants encoded here:
 *   1. `bytes` events arriving outside `loading` are silently ignored.
 *      A late-arriving progress chunk from a superseded fetch should not
 *      flicker an in-flight UI for a slot that's now `ready` or `error`.
 *   2. `total` is monotonic non-decreasing.  Some servers send `0` in the
 *      initial header but populate it later via `Transfer-Encoding: chunked`;
 *      keeping the larger value prevents the loading bar's denominator
 *      from shrinking mid-stream.
 *   3. The reducer is total — every (state, event) pair has a defined
 *      result.  Unhandled combinations return the previous state unchanged
 *      rather than throwing, so a stray late event from a superseded fetch
 *      cannot crash the slot.
 *
 * Why no `Date.now()` here?  The current millisecond is part of the
 * `committed` event payload (`nowMs`), so the reducer remains a pure
 * function of its arguments.  Tests can assert exact timestamps without
 * mocking the clock.
 */
import type { LoadEvent, LoadState } from './types';

export function reduceLoadState<T>(state: LoadState<T>, event: LoadEvent): LoadState<T> {
  switch (event.kind) {
    case 'load-started':
      return { kind: 'loading', req: event.req, loaded: 0, total: 0, attempt: 0 };

    case 'bytes':
      if (state.kind !== 'loading') return state;
      return {
        ...state,
        loaded: event.loaded,
        // Never shrink total — see invariant 2 in the docblock.
        total: event.total > state.total ? event.total : state.total,
      };

    case 'retry-scheduled':
      if (state.kind !== 'loading') return state;
      return { ...state, attempt: event.attempt };

    case 'fetch-succeeded':
      // No state shape change — the slot's next call is `committing`.  This
      // event exists for observability (consoleAdapter logs it) and so the
      // reducer stays exhaustive over LoadEvent.
      return state;

    case 'committing':
      if (state.kind !== 'loading') return state;
      return { kind: 'committing', req: state.req };

    case 'committed':
      if (state.kind !== 'committing') return state;
      return {
        kind: 'ready',
        req: state.req,
        value: event.value as T,
        loadedAtMs: event.nowMs,
      };

    case 'gave-up':
      if (state.kind !== 'loading' && state.kind !== 'committing') return state;
      return {
        kind: 'error',
        req: state.req,
        error: event.error,
        finalAttempt: event.attempt,
      };
  }
}
