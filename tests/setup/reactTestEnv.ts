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
 *
 * If keeping the per-file directive becomes burdensome, promote
 * `environment: 'jsdom'` to a workspace config scoped to
 * `tests/components/**`.
 */

import { afterEach } from 'vitest';

if (typeof window !== 'undefined') {
  // Dynamic-style import inside the gate so node-env tests don't try
  // to load jest-dom's window-dependent setup.
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
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
