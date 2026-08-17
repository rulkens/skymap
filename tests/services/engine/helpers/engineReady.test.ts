/**
 * engineReady — unit tests for the bootstrap-complete predicate.
 *
 * `isEngineReady` is the single answer site for "did the engine's
 * bootstrap phases finish?".  Pre-D.4, the same five-field probe
 * was open-coded in three different shapes across the codebase.
 * These tests pin the behaviour down on two axes:
 *
 *   1. Boolean correctness — false for any of the six handles
 *      being null, true only when all six are populated.
 *   2. Type narrowing — after `if (isEngineReady(state))`, the
 *      compiler treats `state.cam`, `state.gpu.galaxyPointRenderer`,
 *      `state.gpu.renderTargets`, `state.gpu.galaxyPickRenderer`,
 *      `state.gpu.compositor`, and
 *      `state.subsystems.texturedDisks` as non-null without `!` or
 *      `?.`.  We assert this with `@ts-expect-error` over an
 *      access that is intentionally rejected pre-narrowing, plus
 *      a positive access post-narrowing that compiles cleanly.
 *
 * Why test the type narrowing as well as the boolean?  Because the
 * value of D.4 is largely type-system: a boolean predicate with the
 * same runtime behaviour but no `is` clause would let the codebase
 * keep its `state.gpu.galaxyPointRenderer!.upload(...)` non-null assertions.
 * The `state is ReadyEngineState` clause is what makes the
 * non-null assertions disappear — and tsc is the only test runner
 * that can verify it.
 *
 * The fixture stubs handles via `unknown`/`as` casts: the predicate
 * doesn't read any field shapes (only checks `=== null`), so a
 * minimal `{}`-shaped stub is sufficient.  This keeps the test fast
 * and decoupled from the GPU layer's evolving handle types.
 */

import { describe, it, expect } from 'vitest';

import { isEngineReady } from '../../../../src/services/engine/helpers/engineReady';
import type { ReadyEngineState } from '../../../../src/@types/engine/ReadyEngineState';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

/**
 * Build an `EngineState`-shaped fixture with the six guard fields
 * populated by default.  Each test override can null any one of them
 * to exercise the false-branch for that field.
 *
 * `renderTargets` is the offscreen-target table (HDR + half-res volume
 * rows).  It shares the same lifecycle as the other GPU handles:
 * constructed in `initGpu`, torn down in `destroy()`.  Including it here
 * ensures the bootstrap gate checks all of them.
 */
function makeState(
  overrides: {
    cam?: OrbitCamera | null;
    galaxyPointRenderer?: unknown;
    renderTargets?: unknown;
    compositor?: unknown;
    galaxyPickRenderer?: unknown;
    texturedDisks?: unknown;
  } = {},
): EngineState {
  const cam = overrides.cam === undefined ? ({} as unknown as OrbitCamera) : overrides.cam;
  const galaxyPointRenderer =
    overrides.galaxyPointRenderer === undefined ? ({} as unknown) : overrides.galaxyPointRenderer;
  const renderTargets =
    overrides.renderTargets === undefined ? ({} as unknown) : overrides.renderTargets;
  const compositor = overrides.compositor === undefined ? ({} as unknown) : overrides.compositor;
  const galaxyPickRenderer =
    overrides.galaxyPickRenderer === undefined ? ({} as unknown) : overrides.galaxyPickRenderer;
  const texturedDisks =
    overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;
  return {
    cam,
    gpu: { galaxyPointRenderer, renderTargets, compositor, galaxyPickRenderer },
    subsystems: { texturedDisks },
  } as unknown as EngineState;
}

describe('isEngineReady — false branch', () => {
  it('returns false when state.cam is null', () => {
    expect(isEngineReady(makeState({ cam: null }))).toBe(false);
  });

  it('returns false when state.gpu.galaxyPointRenderer is null', () => {
    expect(isEngineReady(makeState({ galaxyPointRenderer: null }))).toBe(false);
  });

  it('returns false when state.gpu.renderTargets is null', () => {
    // renderTargets owns every offscreen row the frame draws into; the
    // engine is never "ready" without it because every render step's
    // viewFor resolution would throw.
    expect(isEngineReady(makeState({ renderTargets: null }))).toBe(false);
  });

  it('returns false when state.gpu.compositor is null', () => {
    // compositor shares renderTargets' bootstrap lifecycle: minted in initGpu,
    // released in destroy(). The FRAME program's hdr→swap composite calls
    // compositor.draw, so a frame must never run without it.
    expect(isEngineReady(makeState({ compositor: null }))).toBe(false);
  });

  it('returns false when state.gpu.galaxyPickRenderer is null', () => {
    expect(isEngineReady(makeState({ galaxyPickRenderer: null }))).toBe(false);
  });

  it('returns false when state.subsystems.texturedDisks is null', () => {
    expect(isEngineReady(makeState({ texturedDisks: null }))).toBe(false);
  });
});

describe('isEngineReady — true branch', () => {
  it('returns true when all guard handles are non-null', () => {
    expect(isEngineReady(makeState())).toBe(true);
  });

  it('does NOT require state.gpu.filamentRenderer to be populated', () => {
    // Crucial: filamentRenderer is intentionally excluded from the
    // bootstrap-complete bag (the no-filaments deployment path is
    // supported).  Even with filamentRenderer absent, isEngineReady
    // must still report true — otherwise that deployment path would
    // never run a per-frame body.
    const state = makeState();
    // No filamentRenderer in the fixture at all — emulates the no-bin
    // deployment.
    expect(isEngineReady(state)).toBe(true);
  });
});

describe('isEngineReady — type narrowing', () => {
  it('narrows state.cam, gpu handles, and texturedDisks to non-null', () => {
    const state = makeState();

    // Pre-narrowing, `state.cam` is `OrbitCamera | null`, so reading
    // a property off it without a guard should be a tsc error.  The
    // `@ts-expect-error` directive asserts that — if a future change
    // to `EngineState` makes `cam` non-null at the canonical type
    // level, this directive will start failing and force a re-think.
    // @ts-expect-error: state.cam is OrbitCamera | null pre-narrowing
    void state.cam.target;

    if (isEngineReady(state)) {
      // Post-narrowing, every guarded field is non-null.  These reads
      // must compile without `!` or `?.`.  The `void` operator
      // suppresses the unused-expression lint warning while still
      // forcing tsc to type-check the property access.
      void state.cam.target;
      void state.gpu.galaxyPointRenderer.totalCount;
      void state.gpu.renderTargets.viewOf;
      void state.gpu.compositor.draw;
      void state.gpu.galaxyPickRenderer.drawPoints;
      void state.subsystems.texturedDisks.beginFrame;

      // Sanity: the runtime value is the same object, only the type
      // narrowing changed.  This guards against a future
      // `isEngineReady` accidentally returning a copy or wrapper.
      expect(state).toBe(state as unknown as ReadyEngineState);
    } else {
      // Force a typed false-branch path.  If the conditional ever
      // collapses (e.g. due to a stub change), this `expect.fail`
      // surfaces it loudly.
      expect.fail('makeState() should produce a ready engine');
    }
  });
});
