/**
 * cameraDriverWrappers — unit tests for `buildCameraDrivers`, the pure
 * builder that wraps the engine's camera movers as `CameraDriver`s.
 *
 * The wrappers are thin mappings: `isActive` should mirror the
 * underlying predicate (a subsystem method or a settings flag) and
 * `apply` should forward to the underlying mutator with the same `cam`
 * and `nowMs` the resolver hands it. These tests assert exactly that
 * mapping against a minimal fake `state` of `vi.fn()` spies. The
 * auto-rotate wrapper has no subsystem to forward to, so it is checked
 * directly: a precise yaw delta and a recomputed `position`.
 *
 * Because every wrapper closes over the live `state`, toggling a fake's
 * return value (or mutating a settings flag) between assertions exercises
 * that the closures read state fresh rather than snapshotting at build
 * time.
 */

import { describe, it, expect, vi } from 'vitest';

import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import { buildCameraDrivers } from '../../../../src/services/engine/camera/cameraDrivers';

// Must match the constant baked into the autoRotate wrapper.
const AUTO_ROTATE_YAW_DELTA = 0.000873;

type FakeState = {
  subsystems: {
    spaceMouse: { hasAxes: ReturnType<typeof vi.fn>; applyToCamera: ReturnType<typeof vi.fn> };
    tweens: { isActive: ReturnType<typeof vi.fn>; advance: ReturnType<typeof vi.fn> };
  };
  settings: { camera: { autoRotate: boolean } };
};

function makeFakeState(): FakeState {
  return {
    subsystems: {
      spaceMouse: { hasAxes: vi.fn(() => false), applyToCamera: vi.fn() },
      tweens: { isActive: vi.fn(() => false), advance: vi.fn(() => false) },
    },
    settings: { camera: { autoRotate: false } },
  };
}

function driverById(state: EngineState, id: string): CameraDriver {
  const drivers = buildCameraDrivers(state);
  const driver = drivers.find((d) => d.id === id);
  if (!driver) throw new Error(`no driver with id '${id}'`);
  return driver;
}

const camStub = {} as OrbitCamera;

describe('buildCameraDrivers — input wrapper', () => {
  it('isActive reflects spaceMouse.hasAxes', () => {
    const fake = makeFakeState();
    const input = driverById(fake as unknown as EngineState, 'input');

    fake.subsystems.spaceMouse.hasAxes.mockReturnValue(true);
    expect(input.isActive(0)).toBe(true);

    fake.subsystems.spaceMouse.hasAxes.mockReturnValue(false);
    expect(input.isActive(0)).toBe(false);
  });

  it('apply forwards cam + nowMs to spaceMouse.applyToCamera', () => {
    const fake = makeFakeState();
    const input = driverById(fake as unknown as EngineState, 'input');

    input.apply(camStub, 1234);

    expect(fake.subsystems.spaceMouse.applyToCamera).toHaveBeenCalledTimes(1);
    expect(fake.subsystems.spaceMouse.applyToCamera).toHaveBeenCalledWith(camStub, 1234);
  });
});

describe('buildCameraDrivers — tween wrapper', () => {
  it('isActive reflects tweenManager.isActive', () => {
    const fake = makeFakeState();
    const tween = driverById(fake as unknown as EngineState, 'tween');

    fake.subsystems.tweens.isActive.mockReturnValue(true);
    expect(tween.isActive(0)).toBe(true);

    fake.subsystems.tweens.isActive.mockReturnValue(false);
    expect(tween.isActive(0)).toBe(false);
  });

  it('apply forwards cam + nowMs to tweenManager.advance', () => {
    const fake = makeFakeState();
    const tween = driverById(fake as unknown as EngineState, 'tween');

    tween.apply(camStub, 5678);

    expect(fake.subsystems.tweens.advance).toHaveBeenCalledTimes(1);
    expect(fake.subsystems.tweens.advance).toHaveBeenCalledWith(camStub, 5678);
  });
});

describe('buildCameraDrivers — autoRotate wrapper', () => {
  it('isActive tracks settings.camera.autoRotate (read fresh through the closure)', () => {
    const fake = makeFakeState();
    const autoRotate = driverById(fake as unknown as EngineState, 'autoRotate');

    fake.settings.camera.autoRotate = true;
    expect(autoRotate.isActive(0)).toBe(true);

    fake.settings.camera.autoRotate = false;
    expect(autoRotate.isActive(0)).toBe(false);
  });

  it('apply increments yaw by the auto-rotate delta and recomputes position', () => {
    const fake = makeFakeState();
    const autoRotate = driverById(fake as unknown as EngineState, 'autoRotate');

    // A real-ish cam stub with the fields `updatePosition` reads/writes:
    // it reads yaw/pitch/distance/target and overwrites `position`.
    const cam = {
      yaw: 0,
      pitch: 0,
      distance: 10,
      target: [0, 0, 0],
      position: new Float32Array([0, 0, 0]),
    } as unknown as OrbitCamera;

    autoRotate.apply(cam, 0);

    expect(cam.yaw).toBeCloseTo(AUTO_ROTATE_YAW_DELTA, 12);
    // updatePosition ran: with yaw≈delta, pitch 0, distance 10, the
    // position is recomputed to target + distance·dir. dir.z = cos(yaw)·
    // cos(pitch) ≈ 1, so z ≈ 10; a tiny yaw also puts a small +x there.
    // Asserting position moved off its zeroed seed proves updatePosition
    // wrote it.
    expect(cam.position[2]).toBeCloseTo(10, 4);
    expect(cam.position[0]).toBeGreaterThan(0);
  });
});
