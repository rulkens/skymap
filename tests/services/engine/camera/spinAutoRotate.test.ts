/**
 * spinAutoRotate — unit tests for the pure auto-rotate yaw advancer.
 *
 * The legacy engine incremented `cam.yaw += AUTO_ROTATE_YAW_DELTA` once per
 * frame, making the spin rate frame-count-dependent.  `spinAutoRotate` converts
 * an elapsed-ms window to an equivalent yaw advance under an assumed 60 fps
 * budget, producing the same visible drift speed without mutating anything.
 *
 * Tests focus on:
 *   - Correct yaw advance (one FRAME_MS ≡ one `rate` radians).
 *   - Only `yaw` changes; all other channels pass through unchanged.
 *   - Strict purity: the input pose and its `target` array are not mutated;
 *     the returned `target` is a fresh array instance.
 */

import { describe, it, expect } from 'vitest';
import { spinAutoRotate } from '../../../../src/services/engine/camera/spinAutoRotate';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

// The assumed frame budget used inside spinAutoRotate.
// Kept here to make assertions self-documenting without importing internals.
const FRAME_MS = 1000 / 60;

function makePose(overrides?: Partial<CameraPose>): CameraPose {
  return {
    target: [1, 2, 3],
    yaw: 0.5,
    pitch: 0.1,
    distance: 200,
    ...overrides,
  };
}

describe('spinAutoRotate', () => {
  it('advances yaw by exactly `rate` radians when elapsedMs equals one FRAME_MS', () => {
    const base = makePose();
    const rate = 0.000873; // legacy AUTO_ROTATE_YAW_DELTA
    const result = spinAutoRotate(base, rate, FRAME_MS);
    expect(result.yaw).toBeCloseTo(base.yaw + rate, 10);
  });

  it('scales linearly — two frames advance yaw by 2 * rate', () => {
    const base = makePose();
    const rate = 0.000873;
    const result = spinAutoRotate(base, rate, 2 * FRAME_MS);
    expect(result.yaw).toBeCloseTo(base.yaw + 2 * rate, 10);
  });

  it('leaves target, pitch, and distance equal to the base values', () => {
    const base = makePose();
    const result = spinAutoRotate(base, 0.001, FRAME_MS);
    expect(result.target[0]).toBe(base.target[0]);
    expect(result.target[1]).toBe(base.target[1]);
    expect(result.target[2]).toBe(base.target[2]);
    expect(result.pitch).toBe(base.pitch);
    expect(result.distance).toBe(base.distance);
  });

  it('is pure — base pose is not mutated after the call', () => {
    const base = makePose();
    const yawBefore = base.yaw;
    const pitchBefore = base.pitch;
    const distanceBefore = base.distance;
    const targetBefore = [...base.target];

    spinAutoRotate(base, 0.001, FRAME_MS);

    expect(base.yaw).toBe(yawBefore);
    expect(base.pitch).toBe(pitchBefore);
    expect(base.distance).toBe(distanceBefore);
    expect([...base.target]).toEqual(targetBefore);
  });

  it('is pure — returned target is a different array instance than base.target', () => {
    const base = makePose();
    const result = spinAutoRotate(base, 0.001, FRAME_MS);
    expect(result.target).not.toBe(base.target);
  });

  it('elapsedMs = 0 returns the same yaw as base', () => {
    const base = makePose();
    const result = spinAutoRotate(base, 0.001, 0);
    expect(result.yaw).toBe(base.yaw);
  });
});
