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
 * final `anim` parameter is the in-frame-animation vote bag runFrame collects
 * from the planners it just ran (the star LOD fade, the Earth tile subsystem);
 * every case here defaults it to at-rest (`NO_ANIM`) and one dedicated case per
 * vote flips it on.
 */

import { describe, it, expect, vi } from 'vitest';

import { shouldKeepTicking } from '../../../../src/services/engine/helpers/shouldKeepTicking';
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RootState } from '../../../../src/store/types';

/**
 * A RootState carrying the two slices shouldKeepTicking reads: the camera slice
 * and the time slice. Both default to their AT-REST value — camera still, clock
 * live (so `selectIsManualPlaying` is false); a case flips exactly one.
 */
function rootWithCamera(
  over: {
    dragging?: boolean;
    tween?: unknown;
    autoRotateActive?: boolean;
    timeMode?: 'live' | 'manual';
    paused?: boolean;
  } = {},
): RootState {
  return {
    camera: {
      dragging: over.dragging ?? false,
      tween: over.tween ?? null,
      autoRotate: { active: over.autoRotateActive ?? false },
      clip: null,
      frameTween: null,
    },
    time: {
      mode: over.timeMode ?? 'live',
      paused: over.paused ?? false,
    },
  } as unknown as RootState;
}

/** At-rest camera — the default for tests exercising the EngineState terms. */
const restingRoot = rootWithCamera();

/** No in-frame animation vote — the default for every case but the vote ones. */
const NO_ANIM = { starFadeAnimating: false, earthTilesAnimating: false };

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
  followWinner?: boolean;
  followStartMs?: number | null;
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
      pointRenderer: null,
      pickRenderer: null,
      renderTargets: null,
    },
    cam: null,
    // The follow-approach-ease term reads these two: the frame's winner id and
    // the follow clock's start. Default is at-rest (resting won, no ease running).
    cameraRuntime: {
      prevActiveId: { current: over.followWinner === true ? 'followBody' : 'resting' },
      clock: { followStartMs: over.followStartMs ?? null },
    },
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

  it('manual clock playing → true even with everything else at rest', () => {
    // A manual sim clock that is advancing (not paused) moves every body every
    // frame, so playback must keep the loop ticking — the same shape as the
    // flow-layer disjunct: one term true, all others at rest.
    const state = makeState({});
    expect(
      shouldKeepTicking(
        state,
        rootWithCamera({ timeMode: 'manual', paused: false }),
        1000,
        NO_ANIM,
      ),
    ).toBe(true);
  });

  it('live clock at 1× with the scene at rest → false (idle-tick path, not this predicate)', () => {
    // Live time advances at real-time rate: nothing perceptible changes per
    // frame, so live must NOT pin the loop. The coarse idle tick (runFrame's
    // wake tail) keeps the terminator honest instead — it is a separate path,
    // deliberately absent from this predicate.
    const state = makeState({});
    expect(
      shouldKeepTicking(state, rootWithCamera({ timeMode: 'live', paused: false }), 1000, NO_ANIM),
    ).toBe(false);
  });

  it('a follow approach ease in flight → true (the wake term the body tween used to carry)', () => {
    // followBody won this frame and its ease started FOCUS_TWEEN_MS/2 ago — still
    // running. Without this term the loop would sleep and the ease would saturate
    // while asleep, snapping the zoom on the next interaction. Everything else is
    // at rest, so this disjunct alone must keep the loop ticking.
    const state = makeState({ followWinner: true, followStartMs: 1000 });
    expect(shouldKeepTicking(state, restingRoot, 1000 + FOCUS_TWEEN_MS / 2, NO_ANIM)).toBe(true);
  });

  it('a SATURATED follow ease → false (steady follow must not pin 60 fps)', () => {
    // The ease finished (elapsed >= FOCUS_TWEEN_MS): steady follow of a body must
    // fall back to the coarse-idle / manual-play paths, not this predicate.
    const state = makeState({ followWinner: true, followStartMs: 1000 });
    expect(shouldKeepTicking(state, restingRoot, 1000 + FOCUS_TWEEN_MS + 1, NO_ANIM)).toBe(false);
  });

  it('a fresh follow with no start yet → false (defensive: null followStartMs)', () => {
    const state = makeState({ followWinner: true, followStartMs: null });
    expect(shouldKeepTicking(state, restingRoot, 5000, NO_ANIM)).toBe(false);
  });

  it('mid-ease window but followBody is NOT the winner → false (term is winner-gated)', () => {
    // A body is focused but autoRotate/drag won the orbit terms; that driver's own
    // wake (selectCameraActive) covers it, so the follow-ease term must not fire.
    const state = makeState({ followWinner: false, followStartMs: 1000 });
    expect(shouldKeepTicking(state, restingRoot, 1000 + FOCUS_TWEEN_MS / 2, NO_ANIM)).toBe(false);
  });

  it('a star LOD fade in flight → true even with everything else at rest', () => {
    // The star-cut planner (prepareStarCut) reports a node mid-dissolve for this
    // frame; the loop must keep ticking to finish the ramp even though the camera
    // is still, no thumbnails are loading, and nothing else animates. This is the
    // vote the star pass used to fire as its own requestRender — now decided here.
    const state = makeState({});
    expect(
      shouldKeepTicking(state, restingRoot, 1000, { ...NO_ANIM, starFadeAnimating: true }),
    ).toBe(true);
  });

  it('Earth tile work in flight → true even with everything else at rest', () => {
    // The vote runFrame reads outside its engage gate: a manifest or a tile
    // still fetching, or a landed tile mid-fade. Without it a camera that
    // stops moving during the manifest fetch sleeps the loop, and the virtual
    // texture never engages at all.
    const state = makeState({});
    expect(
      shouldKeepTicking(state, restingRoot, 1000, { ...NO_ANIM, earthTilesAnimating: true }),
    ).toBe(true);
  });

  it('passes nowMs through to the time-dependent fade/focus terms', () => {
    const isAnyAnimating = vi.fn<(nowMs: number) => boolean>(() => false);
    const isAwake = vi.fn<(nowMs: number) => boolean>(() => false);
    const state = {
      settings: { flow: { enabled: false } },
      gpu: { pointRenderer: null, pickRenderer: null, renderTargets: null },
      cam: null,
      cameraRuntime: {
        prevActiveId: { current: 'resting' },
        clock: { followStartMs: null },
      },
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
