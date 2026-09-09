/**
 * cameraEpochs — unit tests for the pure epoch primitives and `advanceEpochs`.
 *
 * All tests drive `nowMs` explicitly — no real wall-clock — the same
 * (epoch, args) sequence always yields the same numbers.
 */

import { describe, it, expect } from 'vitest';
import {
  UNSTARTED_EPOCHS,
  advanceEpoch,
  advanceEpochs,
  elapsedMs,
} from '../../../../src/services/engine/camera/cameraEpochs';
import type { Epoch } from '../../../../src/@types/engine/camera/Epoch';
import type { CameraState } from '../../../../src/@types/camera/CameraState';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';
import type { FrameTween } from '../../../../src/@types/camera/FrameTween';

function makeDescriptor(): CameraTweenDescriptor {
  return {
    from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
    to: { target: [10, 0, 0], yaw: 1.0, pitch: 0.2, distance: 50 },
    durationMs: 600,
    easing: 'easeOutCubic',
    frame: 'equatorial',
  };
}

const UNSTARTED: Epoch<CameraTweenDescriptor> = { ref: null, startMs: null };

describe('advanceEpoch', () => {
  it('returns the same object when the ref is unchanged', () => {
    const descA = makeDescriptor();
    const epoch = advanceEpoch(UNSTARTED, descA, 1000);
    expect(advanceEpoch(epoch, descA, 1016)).toBe(epoch);
  });

  it('restarts the clock on a ref change', () => {
    const descA = makeDescriptor();
    const descB = makeDescriptor();
    const epoch = advanceEpoch(UNSTARTED, descA, 1000);
    const next = advanceEpoch(epoch, descB, 1100);
    expect(next).toEqual({ ref: descB, startMs: 1100 });
  });

  it('clears startMs when the ref goes null', () => {
    const descA = makeDescriptor();
    const epoch = advanceEpoch(UNSTARTED, descA, 1000);
    const next = advanceEpoch(epoch, null, 1100);
    expect(next).toEqual({ ref: null, startMs: null });
  });

  it('a second advance in the same frame is a no-op', () => {
    const descA = makeDescriptor();
    const first = advanceEpoch(UNSTARTED, descA, 1000);
    const second = advanceEpoch(first, descA, 1032);
    expect(elapsedMs(second, 1048)).toBe(48);
  });
});

describe('elapsedMs', () => {
  it('of an unstarted epoch is 0', () => {
    expect(elapsedMs(UNSTARTED, 5000)).toBe(0);
  });
});

function makeCameraState(overrides?: Partial<CameraState>): CameraState {
  return {
    base: { frame: 'absolute', pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 } },
    tween: null,
    autoRotate: { active: false, rate: 0 },
    dragging: false,
    clip: null,
    frameTween: null,
    ...overrides,
  };
}

function makeFrameTween(): FrameTween {
  return { fromQuat: [0, 0, 0, 1], to: 'ecliptic', durationMs: 800, easing: 'easeOutCubic' };
}

describe('advanceEpochs', () => {
  it('a tween that is not winning does not start its epoch', () => {
    const intent = makeCameraState({ tween: makeDescriptor() });
    // A drag holds the frame; the dispatched tween must wait for its own win.
    const result = advanceEpochs(UNSTARTED_EPOCHS, {
      intent,
      focus: null,
      clip: UNSTARTED_EPOCHS.clip,
      winnerId: 'orbitDrag',
      nowMs: 1000,
    });
    expect(result.tween).toBe(UNSTARTED_EPOCHS.tween);
  });

  it('a winning tween starts its epoch on that frame', () => {
    const tween = makeDescriptor();
    const intent = makeCameraState({ tween });
    const result = advanceEpochs(UNSTARTED_EPOCHS, {
      intent,
      focus: null,
      clip: UNSTARTED_EPOCHS.clip,
      winnerId: 'tween',
      nowMs: 1000,
    });
    expect(result.tween).toEqual({ ref: tween, startMs: 1000 });
  });

  it('the frameTween epoch advances on a frame no driver owns it', () => {
    const frameTween = makeFrameTween();
    const intent = makeCameraState({ frameTween });
    const result = advanceEpochs(UNSTARTED_EPOCHS, {
      intent,
      focus: null,
      clip: UNSTARTED_EPOCHS.clip,
      winnerId: 'resting',
      nowMs: 2000,
    });
    expect(result.frameTween).toEqual({ ref: frameTween, startMs: 2000 });
  });

  it('an unchanged frame returns the same epochs object', () => {
    const intent = makeCameraState();
    const first = advanceEpochs(UNSTARTED_EPOCHS, {
      intent,
      focus: null,
      clip: UNSTARTED_EPOCHS.clip,
      winnerId: 'resting',
      nowMs: 1000,
    });
    const second = advanceEpochs(first, {
      intent,
      focus: null,
      clip: UNSTARTED_EPOCHS.clip,
      winnerId: 'resting',
      nowMs: 1016,
    });
    expect(second).toBe(first);
  });

  it('the autoRotate row restarts when a commit installs a new base while active', () => {
    // A drag-release commits a NEW base object under a live spin; the spin
    // must restart from 0 against it, not carry the accumulated time forward
    // (which would jump the camera).
    const spinning = makeCameraState({ autoRotate: { active: true, rate: 0.01 } });
    const inputs = { focus: null, clip: UNSTARTED_EPOCHS.clip, winnerId: 'autoRotate' };
    const first = advanceEpochs(UNSTARTED_EPOCHS, { ...inputs, intent: spinning, nowMs: 2000 });
    expect(
      elapsedMs(
        advanceEpochs(first, { ...inputs, intent: spinning, nowMs: 2050 }).autoRotate,
        2050,
      ),
    ).toBe(50);

    const recommitted = { ...spinning, base: { ...spinning.base } };
    const next = advanceEpochs(first, { ...inputs, intent: recommitted, nowMs: 2060 });
    expect(next.autoRotate).toEqual({ ref: recommitted.base, startMs: 2060 });
  });

  it('the clip row is passed through untouched', () => {
    const clipEpoch: Epoch<NonNullable<CameraState['clip']>> = {
      ref: { data: { timeline: [] }, frame: 'equatorial' },
      startMs: 5000,
    };
    const intent = makeCameraState();
    const result = advanceEpochs(UNSTARTED_EPOCHS, {
      intent,
      focus: null,
      clip: clipEpoch,
      winnerId: 'clip',
      nowMs: 5000,
    });
    expect(result.clip).toBe(clipEpoch);
  });
});
