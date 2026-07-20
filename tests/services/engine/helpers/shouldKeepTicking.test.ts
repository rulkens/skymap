/**
 * shouldKeepTicking — the render-on-demand keep-alive predicate.
 *
 * These tests pin the contract that froze the flow field: an animated overlay
 * must keep the loop ticking INDEPENDENTLY of whether anything is pickable. The
 * predicate takes no pick/catalog information at all — its signature is the
 * proof — so the regression case ('only flow is on') is a first-class test here
 * rather than needing a full GPU-ready runFrame fixture (which the runFrame
 * suite documents as disproportionate). runFrame's job is only to REACH this
 * predicate every ready frame; that it does is guarded structurally by the
 * pick block no longer early-returning.
 *
 * The camera term is `selectCameraActive(s)` over the store `RootState`; each
 * test seeds an at-rest or active camera slice rather than a driver array. The
 * final `anim` parameter is the in-frame-animation vote bag runFrame derives
 * from the planners it just ran (today only the star LOD fade); every case here
 * defaults it to at-rest (`NO_ANIM`) and the dedicated case flips it on.
 */

import { describe, it, expect, vi } from 'vitest';

import { shouldKeepTicking } from '../../../../src/services/engine/helpers/shouldKeepTicking';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RootState } from '../../../../src/store/types';

/** A RootState whose only term shouldKeepTicking reads is the camera slice. */
function rootWithCamera(
  over: { dragging?: boolean; tween?: unknown; autoRotateActive?: boolean } = {},
): RootState {
  return {
    camera: {
      dragging: over.dragging ?? false,
      tween: over.tween ?? null,
      autoRotate: { active: over.autoRotateActive ?? false },
      clip: null,
    },
  } as unknown as RootState;
}

/** At-rest camera — the default for tests exercising the EngineState terms. */
const restingRoot = rootWithCamera();

/** No in-frame animation vote — the default for every case but the star-fade one. */
const NO_ANIM = { starFadeAnimating: false };

/**
 * Minimal state covering every term shouldKeepTicking reads. All terms default
 * to their AT-REST value (nothing animating); each test flips exactly one.
 *
 * `isEngineReady` is left false (null GPU handles), so the textured-disk term
 * short-circuits to false without needing a thumbnail subsystem — the tests
 * that care about flow/fades/focus don't depend on it. The one test that
 * exercises the in-flight-thumbnail term builds a ready state explicitly.
 */
function makeState(over: {
  flowEnabled?: boolean;
  flowReady?: boolean;
  fadesAnimating?: boolean;
  focusAwake?: boolean;
}): EngineState {
  const flowSlot =
    over.flowReady === true
      ? ({ state: () => ({ kind: 'ready' }) } as unknown)
      : over.flowReady === false
        ? ({ state: () => ({ kind: 'idle' }) } as unknown)
        : null;

  return {
    settings: { flow: { enabled: over.flowEnabled ?? false } },
    gpu: {
      renderer: null,
      pickRenderer: null,
      renderTargets: null,
    },
    cam: null,
    subsystems: {
      texturedDisks: null,
      fades: { isAnyAnimating: () => over.fadesAnimating ?? false },
      structureFocus: { isAwake: () => over.focusAwake ?? false },
    },
    assetSlots: { flow: flowSlot },
  } as unknown as EngineState;
}

describe('shouldKeepTicking', () => {
  it('REGRESSION: flow enabled + loaded → true even with nothing else animating', () => {
    // The bug: every galaxy catalog is off (nothing pickable), but the flow
    // field is on and its cube committed — the loop MUST keep ticking so the
    // ribbons keep advecting without the cursor poking requestRender.
    const state = makeState({ flowEnabled: true, flowReady: true });
    expect(shouldKeepTicking(state, restingRoot, 1000, NO_ANIM)).toBe(true);
  });

  it('at rest (flow off, camera at rest, no fades/focus) → false', () => {
    const state = makeState({});
    expect(shouldKeepTicking(state, restingRoot, 1000, NO_ANIM)).toBe(false);
  });

  it('flow enabled but NOT loaded → false (the slotReady guard)', () => {
    const state = makeState({ flowEnabled: true, flowReady: false });
    expect(shouldKeepTicking(state, restingRoot, 1000, NO_ANIM)).toBe(false);
  });

  it('flow loaded but disabled → false (the enabled guard)', () => {
    const state = makeState({ flowEnabled: false, flowReady: true });
    expect(shouldKeepTicking(state, restingRoot, 1000, NO_ANIM)).toBe(false);
  });

  it('a dragging camera → true (selectCameraActive)', () => {
    const state = makeState({});
    expect(shouldKeepTicking(state, rootWithCamera({ dragging: true }), 1000, NO_ANIM)).toBe(true);
  });

  it('an in-flight tween → true (selectCameraActive)', () => {
    const state = makeState({});
    expect(shouldKeepTicking(state, rootWithCamera({ tween: {} }), 1000, NO_ANIM)).toBe(true);
  });

  it('auto-rotate spinning → true (selectCameraActive)', () => {
    const state = makeState({});
    expect(
      shouldKeepTicking(state, rootWithCamera({ autoRotateActive: true }), 1000, NO_ANIM),
    ).toBe(true);
  });

  it('a fade animating → true', () => {
    const state = makeState({ fadesAnimating: true });
    expect(shouldKeepTicking(state, restingRoot, 1000, NO_ANIM)).toBe(true);
  });

  it('structure-focus fade awake → true', () => {
    const state = makeState({ focusAwake: true });
    expect(shouldKeepTicking(state, restingRoot, 1000, NO_ANIM)).toBe(true);
  });

  it('a star LOD fade in flight → true even with everything else at rest', () => {
    // The star-cut planner (prepareStarCut) reports a node mid-dissolve for this
    // frame; the loop must keep ticking to finish the ramp even though the camera
    // is still, no thumbnails are loading, and nothing else animates. This is the
    // vote the star pass used to fire as its own requestRender — now decided here.
    const state = makeState({});
    expect(shouldKeepTicking(state, restingRoot, 1000, { starFadeAnimating: true })).toBe(true);
  });

  it('passes nowMs through to the time-dependent fade/focus terms', () => {
    const isAnyAnimating = vi.fn<(nowMs: number) => boolean>(() => false);
    const isAwake = vi.fn<(nowMs: number) => boolean>(() => false);
    const state = {
      settings: { flow: { enabled: false } },
      gpu: { renderer: null, pickRenderer: null, renderTargets: null },
      cam: null,
      subsystems: {
        texturedDisks: null,
        fades: { isAnyAnimating },
        structureFocus: { isAwake },
      },
      assetSlots: { flow: null },
    } as unknown as EngineState;

    shouldKeepTicking(state, restingRoot, 4242, NO_ANIM);

    expect(isAnyAnimating).toHaveBeenCalledWith(4242);
    expect(isAwake).toHaveBeenCalledWith(4242);
  });
});
