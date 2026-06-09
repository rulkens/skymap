/**
 * cameraDrivers — unit tests for the single-writer camera arbiter.
 *
 * The resolver is pure over its driver list, so the tests use fake
 * drivers built from `vi.fn()` spies and a throwaway `cam` stub (the
 * resolver never touches `cam` — it only forwards it to the winner).
 * The behaviours under test:
 *
 *   - Among multiple active drivers, only the single highest-priority
 *     one's `apply` runs.
 *   - An inactive higher-priority driver does not block a lower active
 *     one — precedence is decided among the active set, not the whole
 *     registry.
 *   - When no driver is active, no `apply` runs at all.
 *   - The winner's `apply` receives the exact `cam` reference and the
 *     `nowMs` passed in.
 */

import { describe, it, expect, vi } from 'vitest';

import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import { runCameraDrivers } from '../../../../src/services/engine/camera/cameraDrivers';

// The resolver never reads or mutates the camera, so a bare object cast
// to OrbitCamera is a sufficient stub. We only assert it is forwarded
// by-reference to the winner's apply.
const camStub = {} as OrbitCamera;

function makeDriver(
  id: string,
  priority: number,
  active: boolean,
): CameraDriver {
  return {
    id,
    priority,
    isActive: vi.fn(() => active),
    apply: vi.fn(),
  };
}

describe('runCameraDrivers', () => {
  it('calls the single highest-priority active driver', () => {
    const high = makeDriver('high', 60, true);
    const low = makeDriver('low', 20, true);

    runCameraDrivers([low, high], camStub, 0);

    expect(high.apply).toHaveBeenCalledTimes(1);
    expect(low.apply).not.toHaveBeenCalled();
  });

  it('ignores inactive higher-priority drivers', () => {
    const inactiveHigh = makeDriver('inactiveHigh', 100, false);
    const activeLow = makeDriver('activeLow', 20, true);

    runCameraDrivers([inactiveHigh, activeLow], camStub, 0);

    expect(activeLow.apply).toHaveBeenCalledTimes(1);
    expect(inactiveHigh.apply).not.toHaveBeenCalled();
  });

  it('writes nothing when no driver is active', () => {
    const a = makeDriver('a', 100, false);
    const b = makeDriver('b', 20, false);

    runCameraDrivers([a, b], camStub, 0);

    expect(a.apply).not.toHaveBeenCalled();
    expect(b.apply).not.toHaveBeenCalled();
  });

  it('forwards cam and nowMs to apply', () => {
    const driver = makeDriver('only', 50, true);
    const nowMs = 1234;

    runCameraDrivers([driver], camStub, nowMs);

    expect(driver.apply).toHaveBeenCalledTimes(1);
    expect(driver.apply).toHaveBeenCalledWith(camStub, nowMs);
    // The EXACT reference, not just a structural match.
    const [firstArg] = (driver.apply as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(firstArg).toBe(camStub);
  });
});
