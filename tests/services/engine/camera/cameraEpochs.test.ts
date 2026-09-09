/**
 * cameraEpochs — unit tests for the pure `advanceEpoch`/`elapsedMs` pair.
 *
 * All tests drive `nowMs` explicitly — no real wall-clock — validating the
 * purity-of-source contract the mutable `CameraClock` will be replaced by.
 */

import { describe, it, expect } from 'vitest';
import { advanceEpoch, elapsedMs } from '../../../../src/services/engine/camera/cameraEpochs';
import type { Epoch } from '../../../../src/@types/engine/camera/Epoch';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';

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
