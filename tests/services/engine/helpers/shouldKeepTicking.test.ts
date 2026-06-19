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
 */

import { describe, it, expect, vi } from 'vitest';

import { shouldKeepTicking } from '../../../../src/services/engine/helpers/shouldKeepTicking';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';

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
      postProcess: null,
      volumeOffscreen: null,
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

/** A camera driver whose activity the test controls. */
function driver(active: boolean): CameraDriver {
  return { isActive: () => active } as unknown as CameraDriver;
}

describe('shouldKeepTicking', () => {
  it('REGRESSION: flow enabled + loaded → true even with nothing else animating', () => {
    // The bug: every galaxy catalog is off (nothing pickable), but the flow
    // field is on and its cube committed — the loop MUST keep ticking so the
    // ribbons keep advecting without the cursor poking requestRender.
    const state = makeState({ flowEnabled: true, flowReady: true });
    expect(shouldKeepTicking(state, [], 1000)).toBe(true);
  });

  it('at rest (flow off, no drivers, no fades/focus) → false', () => {
    const state = makeState({});
    expect(shouldKeepTicking(state, [driver(false)], 1000)).toBe(false);
  });

  it('flow enabled but NOT loaded → false (the slotReady guard)', () => {
    const state = makeState({ flowEnabled: true, flowReady: false });
    expect(shouldKeepTicking(state, [], 1000)).toBe(false);
  });

  it('flow loaded but disabled → false (the enabled guard)', () => {
    const state = makeState({ flowEnabled: false, flowReady: true });
    expect(shouldKeepTicking(state, [], 1000)).toBe(false);
  });

  it('an active camera driver → true (drivers.some is the OR of movers)', () => {
    const state = makeState({});
    expect(shouldKeepTicking(state, [driver(false), driver(true)], 1000)).toBe(true);
  });

  it('a fade animating → true', () => {
    const state = makeState({ fadesAnimating: true });
    expect(shouldKeepTicking(state, [], 1000)).toBe(true);
  });

  it('structure-focus fade awake → true', () => {
    const state = makeState({ focusAwake: true });
    expect(shouldKeepTicking(state, [], 1000)).toBe(true);
  });

  it('passes nowMs through to every time-dependent term', () => {
    const isActive = vi.fn<(nowMs: number) => boolean>(() => false);
    const isAnyAnimating = vi.fn<(nowMs: number) => boolean>(() => false);
    const isAwake = vi.fn<(nowMs: number) => boolean>(() => false);
    const state = {
      settings: { flow: { enabled: false } },
      gpu: { renderer: null, pickRenderer: null, postProcess: null, volumeOffscreen: null },
      cam: null,
      subsystems: {
        texturedDisks: null,
        fades: { isAnyAnimating },
        structureFocus: { isAwake },
      },
      assetSlots: { flow: null },
    } as unknown as EngineState;

    shouldKeepTicking(state, [{ isActive } as unknown as CameraDriver], 4242);

    expect(isActive).toHaveBeenCalledWith(4242);
    expect(isAnyAnimating).toHaveBeenCalledWith(4242);
    expect(isAwake).toHaveBeenCalledWith(4242);
  });
});
