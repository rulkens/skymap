/**
 * cameraDrivers — unit tests for the single-writer camera arbiter.
 *
 * The resolver is pure over its driver list, so the tests use fake
 * drivers built from typed `vi.fn()` spies and a throwaway `cam` stub.
 * The resolver only forwards `cam` to the winner's `pose`; it never
 * reads or mutates `cam` itself. The behaviours under test:
 *
 *   - Among multiple active drivers, the resolver returns the single
 *     highest-priority one's pose.
 *   - Priority wins regardless of list order — the resolver is a
 *     max-scan, not first-match.
 *   - An inactive higher-priority driver does not block a lower active
 *     one — precedence is decided among the active set, not the whole
 *     registry.
 *   - An always-active resting-like driver is a sufficient floor —
 *     the resolver always returns a pose without a nullable return.
 *   - Defensive: when no driver is active, the resolver returns
 *     poseOf(cam) rather than null.
 */

import { describe, it, expect, vi } from 'vitest';

import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { RootState } from '../../../../src/store/types';
import { runCameraDrivers } from '../../../../src/services/engine/camera/cameraDrivers';
import { poseOf } from '../../../../src/services/engine/camera/poseOf';

// Fake RootState — the resolver only forwards it to driver.isActive/pose.
const fakeState = {} as RootState;

// Throwaway cam stub. poseOf reads four fields; give them real values
// so the defensive-fallback test can assert deep equality.
const camStub = {
  target: [1, 2, 3] as [number, number, number],
  yaw: 0.5,
  pitch: 0.3,
  distance: 100,
} as OrbitCamera;

function makeDriver(
  id: string,
  priority: number,
  active: boolean,
  sentinelPose: CameraPose,
): CameraDriver {
  return {
    id,
    priority,
    isActive: vi.fn<(s: RootState) => boolean>(() => active),
    pose: vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(() => sentinelPose),
  };
}

const poseA: CameraPose = { target: [10, 0, 0], yaw: 1, pitch: 0, distance: 50 };
const poseB: CameraPose = { target: [0, 20, 0], yaw: 2, pitch: 0.1, distance: 80 };

describe('runCameraDrivers', () => {
  it("returns the highest-priority active driver's pose", () => {
    const low = makeDriver('low', 20, true, poseA);
    const high = makeDriver('high', 60, true, poseB);

    const result = runCameraDrivers([low, high], fakeState, camStub, 0);

    expect(result).toBe(poseB);
    expect(high.pose).toHaveBeenCalledTimes(1);
    expect(low.pose).not.toHaveBeenCalled();
  });

  it('picks by priority, not list order', () => {
    const low = makeDriver('low', 20, true, poseA);
    const high = makeDriver('high', 60, true, poseB);

    // Both orderings must return the high-priority pose.
    expect(runCameraDrivers([low, high], fakeState, camStub, 0)).toBe(poseB);
    expect(runCameraDrivers([high, low], fakeState, camStub, 0)).toBe(poseB);
  });

  it('ignores an inactive higher-priority driver', () => {
    const inactiveHigh = makeDriver('inactiveHigh', 100, false, poseA);
    const activeLow = makeDriver('activeLow', 20, true, poseB);

    const result = runCameraDrivers([inactiveHigh, activeLow], fakeState, camStub, 0);

    expect(result).toBe(poseB);
    expect(activeLow.pose).toHaveBeenCalledTimes(1);
    expect(inactiveHigh.pose).not.toHaveBeenCalled();
  });

  it("returns the always-active resting driver's pose when it is the only driver", () => {
    const restingPose: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
    const resting = makeDriver('resting', 0, true, restingPose);

    const result = runCameraDrivers([resting], fakeState, camStub, 0);

    expect(result).toBe(restingPose);
    expect(resting.pose).toHaveBeenCalledTimes(1);
  });

  it('defensive: returns poseOf(cam) when no driver is active', () => {
    const a = makeDriver('a', 100, false, poseA);
    const b = makeDriver('b', 20, false, poseB);

    const result = runCameraDrivers([a, b], fakeState, camStub, 0);

    expect(result).toEqual(poseOf(camStub));
    expect(a.pose).not.toHaveBeenCalled();
    expect(b.pose).not.toHaveBeenCalled();
  });
});
