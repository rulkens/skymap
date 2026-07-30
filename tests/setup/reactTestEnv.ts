/**
 * tests/setup/reactTestEnv.ts — vitest setupFile for component tests.
 *
 * Why a separate setupFile from `webgpuGlobals.ts`?
 *
 * - WebGPU constants are required by GPU renderer tests, which run in
 *   the default `node` environment.  Loading jsdom for those would
 *   bloat their start-up cost (~150 ms each) for no benefit.
 * - Component tests run in `jsdom`, declared via the per-file
 *   `// @vitest-environment jsdom` directive at the top of each
 *   component test file.  This setupFile is harmless under `node`:
 *   the `cleanup()` call no-ops without a DOM and the matcher import
 *   is gated below.
 *
 * Responsibilities:
 *
 * 1. Register `@testing-library/jest-dom` matchers (`toBeInTheDocument`,
 *    `toHaveAttribute`, etc.) on vitest's `expect`.  Only when a DOM is
 *    present — otherwise jest-dom's setup throws.
 * 2. Auto-cleanup the React render tree after each test, so leftover
 *    DOM from a prior test can't be matched by a later getByText.
 * 3. Reset `window.location`'s hash after each test. jsdom gives every
 *    test in a file the SAME `window.location` — there is no per-`it()`
 *    navigation reset the way there is a fresh DOM per `render()`. Any
 *    store wired up with `watchHashWriteSaga` calls the real
 *    `history.pushState` when selection/clock/orientation state changes,
 *    so a test that drives such a store leaves its hash sitting on
 *    `window.location` for every test that runs afterwards in the same
 *    file. The next test that boots a fresh store runs the URL's arrival
 *    read against that leaked hash and silently inherits state (e.g. a
 *    clock mode) it never asked for. This is `afterEach`, not
 *    `beforeEach`, on purpose: a test that deliberately seeds a hash does
 *    so at its own start (`window.location.hash = ...`), and a
 *    `beforeEach` reset would run after that setup and clobber it before
 *    the test body sees it. Cleaning up only what THIS test may have left
 *    behind, once it's done with it, is the half of the leave-as-you-
 *    found-it contract that doesn't fight deliberate setup.
 *
 *    The reset waits a macrotask first, and that wait is load-bearing.
 *    `watchHashWriteSaga` publishes on the TRAILING EDGE of a burst of
 *    triggers, so a synchronous test body returns with its URL write still
 *    a pending timer: reset first and the push lands afterwards, on a
 *    bar this hook has already cleaned, and the leak survives into a later
 *    test — arriving mid-test rather than at its start, which is the worse
 *    version of the same bug. The timer function is captured at module load
 *    so a test that installed `vi.useFakeTimers()` and did not restore them
 *    cannot freeze the teardown.
 *
 * If keeping the per-file directive becomes burdensome, promote
 * `environment: 'jsdom'` to a workspace config scoped to
 * `tests/components/**`.
 */

import { afterEach } from 'vitest';

// Bound before any test file has had the chance to install fake timers, so
// the teardown drain below always uses a timer that really fires.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

if (typeof window !== 'undefined') {
  // Dynamic-style import inside the gate so node-env tests don't try
  // to load jest-dom's window-dependent setup.
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(async () => {
    cleanup();

    // Let any trailing-edge hash publish land BEFORE the reset — see (3).
    await new Promise((resolve) => realSetTimeout(resolve, 0));

    // `replaceState`, never `pushState`: a cleanup step must shrink back
    // to nothing, not grow the history stack test-over-test. The hash
    // check is just a fast path for the common (unused) case.
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });

  // jsdom omits ResizeObserver, but DiskOverlay observes its SVG to keep
  // grab-handle sizes screen-constant.  A no-op stub lets the overlay (and
  // anything mounting it, e.g. CropCanvas) render without throwing.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }

  // jsdom omits Element.prototype.scrollTo.  Components that call
  // scrollRef.current?.scrollTo(...) in an effect (e.g. MobileSheet
  // resetting scroll position on open) would throw TypeError at mount time.
  // A no-op here is the single source instead of repeating per-file stubs —
  // same rationale as the ResizeObserver and fetch stubs above.  The property
  // is writable/configurable, so individual tests can still swap in a vi.fn()
  // to spy on calls and restore the no-op when done.
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {};
  }
}
