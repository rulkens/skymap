/**
 * shouldKeepTicking — the render-on-demand keep-alive predicate. An animated
 * Layer (e.g. flow, mid-advection) must keep the loop ticking INDEPENDENTLY
 * of whether anything is pickable — that vote arrives pre-folded as
 * `anim.layersAwake` (see `runFrame`'s per-Layer `frame` hook loop), so
 * this predicate itself takes no pick/catalog/Layer information at all.
 *
 * The camera term is `selectCameraActive(s)` over the store `RootState`. The
 * final `anim` parameter is the in-frame-animation vote bag runFrame collects
 * from the planners it just ran (star LOD fade, Earth tile subsystem); every
 * case here defaults it to at-rest (`NO_ANIM`).
 */

import { describe, it, expect } from 'vitest';

import { shouldKeepTicking } from '../../../../src/services/engine/helpers/shouldKeepTicking';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
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
      // The auto-rotate term is arm-gated (see `selectCameraActive`), so the
      // fixture carries the at-rest arm every real store boots with.
      base: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 }),
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
const NO_ANIM = {
  starFadeAnimating: false,
  surfaceTilesAnimating: false,
  labelsAnimating: false,
  probeDue: false,
  layersAwake: false,
};

/**
 * Minimal state covering every term shouldKeepTicking reads. All terms default
 * to their AT-REST value (nothing animating); each test flips exactly one.
 *
 */
function makeState(over: {
  fadesAnimating?: boolean;
  focusAwake?: boolean;
  followWinner?: boolean;
  followSaturated?: boolean | null;
}): EngineState {
  return {
    gpu: {
      galaxyPointRenderer: null,
      galaxyPickRenderer: null,
      renderTargets: null,
    },
    booted: false,
    // The follow-approach-ease term reads these two: the frame's winner id and
    // the follow memory's saturation. Default is at-rest (resting won, no memory).
    cameraRuntime: {
      register: { winner: over.followWinner === true ? 'followApproach' : 'resting' },
      follow:
        over.followSaturated === null || over.followSaturated === undefined
          ? null
          : { saturated: over.followSaturated },
    },
    subsystems: {
      texturedDisks: null,
      fades: { isAnyAnimating: () => over.fadesAnimating ?? false },
      structureFocus: { isAwake: () => over.focusAwake ?? false },
    },
  } as unknown as EngineState;
}

describe('shouldKeepTicking', () => {
  it('at rest (camera at rest, no fades/focus) → false', () => {
    const state = makeState({});
    expect(shouldKeepTicking(state, restingRoot, 1000, NO_ANIM)).toBe(false);
  });

  it('a dragging camera → true (selectCameraActive)', () => {
    const state = makeState({});
    expect(shouldKeepTicking(state, rootWithCamera({ dragging: true }), 1000, NO_ANIM)).toBe(true);
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
    // A follow row won this frame and its memory has not saturated. Without this
    // term the loop would sleep and the ease would saturate while asleep, snapping
    // the zoom on the next interaction. Everything else is at rest, so this
    // disjunct alone must keep the loop ticking.
    const state = makeState({ followWinner: true, followSaturated: false });
    expect(shouldKeepTicking(state, restingRoot, 5000, NO_ANIM)).toBe(true);
  });

  it('a SATURATED follow ease → false (steady follow must not pin 60 fps)', () => {
    // The approach handed off: steady follow of a body must fall back to the
    // coarse-idle / manual-play paths, not this predicate.
    const state = makeState({ followWinner: true, followSaturated: true });
    expect(shouldKeepTicking(state, restingRoot, 5000, NO_ANIM)).toBe(false);
  });

  it('a follow row winning with no memory yet → false', () => {
    const state = makeState({ followWinner: true, followSaturated: null });
    expect(shouldKeepTicking(state, restingRoot, 5000, NO_ANIM)).toBe(false);
  });

  it('an unsaturated ease but no follow row winning → false (term is winner-gated)', () => {
    // A body is focused but autoRotate/drag won the orbit terms; that driver's own
    // wake (selectCameraActive) covers it, so the follow-ease term must not fire.
    const state = makeState({ followWinner: false, followSaturated: false });
    expect(shouldKeepTicking(state, restingRoot, 5000, NO_ANIM)).toBe(false);
  });

  it('a star LOD fade in flight → true even with everything else at rest', () => {
    // The star-cut planner (computeStarCut) reports a node mid-dissolve for this
    // frame; the loop must keep ticking to finish the ramp even though the camera
    // is still, no thumbnails are loading, and nothing else animates. This is the
    // vote read here instead of the star pass firing its own requestRender.
    const state = makeState({});
    expect(
      shouldKeepTicking(state, restingRoot, 1000, { ...NO_ANIM, starFadeAnimating: true }),
    ).toBe(true);
  });

  it('layersAwake is a keep-alive term — true even with everything else at rest', () => {
    // A Layer's frame hook voted awake this frame (D2); runFrame folds every
    // hook's vote into this one bag entry, so the predicate need not know
    // anything about Layers itself — just this bit.
    const state = makeState({});
    expect(shouldKeepTicking(state, restingRoot, 1000, { ...NO_ANIM, layersAwake: true })).toBe(
      true,
    );
  });
});
