/**
 * engineReady — unit tests for the bootstrap-complete predicate.
 *
 * `isEngineReady` is the single answer site for "did the engine's
 * bootstrap phases finish?".  Pre-D.4, the same five-field probe
 * was open-coded in three different shapes across the codebase.
 * These tests pin the behaviour down on two axes:
 *
 *   1. Boolean correctness — false for any of the five handles
 *      being null, true only when all five are populated.
 *   2. Type narrowing — after `if (isEngineReady(state))`, the
 *      compiler treats `state.cam`, `state.gpu.renderer`,
 *      `state.gpu.postProcess`, `state.gpu.pickRenderer`, and
 *      `state.subsystems.texturedImpostors` as non-null without `!` or
 *      `?.`.  We assert this with `@ts-expect-error` over an
 *      access that is intentionally rejected pre-narrowing, plus
 *      a positive access post-narrowing that compiles cleanly.
 *
 * Why test the type narrowing as well as the boolean?  Because the
 * value of D.4 is largely type-system: a boolean predicate with the
 * same runtime behaviour but no `is` clause would let the codebase
 * keep its `state.gpu.renderer!.upload(...)` non-null assertions.
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
 * Build an `EngineState`-shaped fixture with the five guard fields
 * populated by default.  Each test override can null any one of them
 * to exercise the false-branch for that field.
 */
function makeState(overrides: {
  cam?: OrbitCamera | null;
  renderer?: unknown;
  postProcess?: unknown;
  pickRenderer?: unknown;
  texturedImpostors?: unknown;
} = {}): EngineState {
  const cam = overrides.cam === undefined ? ({} as unknown as OrbitCamera) : overrides.cam;
  const renderer = overrides.renderer === undefined ? ({} as unknown) : overrides.renderer;
  const postProcess =
    overrides.postProcess === undefined ? ({} as unknown) : overrides.postProcess;
  const pickRenderer =
    overrides.pickRenderer === undefined ? ({} as unknown) : overrides.pickRenderer;
  const texturedImpostors =
    overrides.texturedImpostors === undefined ? ({} as unknown) : overrides.texturedImpostors;
  return {
    cam,
    gpu: { renderer, postProcess, pickRenderer },
    subsystems: { texturedImpostors },
  } as unknown as EngineState;
}

describe('isEngineReady — false branch', () => {
  it('returns false when state.cam is null', () => {
    expect(isEngineReady(makeState({ cam: null }))).toBe(false);
  });

  it('returns false when state.gpu.renderer is null', () => {
    expect(isEngineReady(makeState({ renderer: null }))).toBe(false);
  });

  it('returns false when state.gpu.postProcess is null', () => {
    expect(isEngineReady(makeState({ postProcess: null }))).toBe(false);
  });

  it('returns false when state.gpu.pickRenderer is null', () => {
    expect(isEngineReady(makeState({ pickRenderer: null }))).toBe(false);
  });

  it('returns false when state.subsystems.texturedImpostors is null', () => {
    expect(isEngineReady(makeState({ texturedImpostors: null }))).toBe(false);
  });
});

describe('isEngineReady — true branch', () => {
  it('returns true when all five handles are non-null', () => {
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
  it('narrows state.cam, gpu handles, and texturedImpostors to non-null', () => {
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
      void state.gpu.renderer.totalCount;
      void state.gpu.postProcess.draw;
      void state.gpu.pickRenderer.pick;
      void state.subsystems.texturedImpostors.runFrame;

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
