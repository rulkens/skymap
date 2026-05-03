import { describe, it, expect } from 'vitest';
import { createOrbitCamera } from '../../src/camera/orbitCamera';
import { applyAxesToCamera, hasAnyAxis } from '../../src/input/spaceMouseToCamera';
import type { SpaceMouseAxes } from '../../src/input/spaceMouseAxes';

const ZERO: SpaceMouseAxes = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };

function makeCam() {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 100,
    yaw: 0,
    pitch: 0,
    fovYRad: Math.PI / 4,
    aspect: 1,
    near: 1,
    far: 1000,
  });
}

describe('applyAxesToCamera', () => {
  it('zero input leaves the camera state unchanged', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, ZERO, 16);
    expect(cam.yaw).toBe(0);
    expect(cam.pitch).toBe(0);
    expect(cam.distance).toBe(100);
    expect(cam.target[0]).toBe(0);
    expect(cam.target[1]).toBe(0);
    expect(cam.target[2]).toBe(0);
  });

  it('positive rz increases yaw (turn right)', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, rz: 1 }, 100);
    expect(cam.yaw).toBeGreaterThan(0);
  });

  it('positive rx increases pitch (tilt up)', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, rx: 1 }, 100);
    expect(cam.pitch).toBeGreaterThan(0);
  });

  it('clamps pitch to ±π/2 - ε on extreme input', () => {
    const cam = makeCam();
    // A massive dt simulates a runaway frame; pitch must not exceed the limit.
    applyAxesToCamera(cam, { ...ZERO, rx: 1 }, 100_000);
    expect(cam.pitch).toBeLessThan(Math.PI / 2);
    expect(cam.pitch).toBeCloseTo(Math.PI / 2 - 0.001, 4);

    // Likewise on the negative side.
    applyAxesToCamera(cam, { ...ZERO, rx: -1 }, 100_000);
    expect(cam.pitch).toBeGreaterThan(-Math.PI / 2);
    expect(cam.pitch).toBeCloseTo(-Math.PI / 2 + 0.001, 4);
  });

  it('positive tz zooms OUT (distance grows)', () => {
    // Spec: "negative tz zooms in". So positive tz must zoom out (distance up).
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, tz: 1 }, 100);
    expect(cam.distance).toBeGreaterThan(100);
  });

  it('negative tz zooms IN (distance shrinks)', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, tz: -1 }, 100);
    expect(cam.distance).toBeLessThan(100);
    expect(cam.distance).toBeGreaterThan(0); // never crosses through zero
  });

  it('zoom is exponential — repeated frames at fixed input compound multiplicatively', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, tz: 1 }, 50);
    const afterOne = cam.distance;
    applyAxesToCamera(cam, { ...ZERO, tz: 1 }, 50);
    const afterTwo = cam.distance;

    // Linear zoom would give afterTwo - afterOne === afterOne - 100. Exponential
    // zoom gives afterTwo / afterOne === afterOne / 100 (constant ratio).
    expect(afterTwo / afterOne).toBeCloseTo(afterOne / 100, 4);
  });

  it('positive tx pans the target along world +X at yaw=0, pitch=0', () => {
    // At yaw=0,pitch=0 the right vector is (1, 0, 0); pushing tx > 0 should
    // shift target along +X with no change in Y or Z.
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, tx: 1 }, 100);
    expect(cam.target[0]).toBeGreaterThan(0);
    expect(cam.target[1]).toBeCloseTo(0, 6);
    expect(cam.target[2]).toBeCloseTo(0, 6);
  });

  it('positive ty pans the target along world +Y at pitch=0', () => {
    // At pitch=0 the up vector is (0, 1, 0).
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ty: 1 }, 100);
    expect(cam.target[0]).toBeCloseTo(0, 6);
    expect(cam.target[1]).toBeGreaterThan(0);
    expect(cam.target[2]).toBeCloseTo(0, 6);
  });

  it('pan magnitude scales with distance (scale-invariant feel)', () => {
    const camNear = makeCam();
    camNear.distance = 10;
    applyAxesToCamera(camNear, { ...ZERO, tx: 1 }, 100);

    const camFar = makeCam();
    camFar.distance = 1000;
    applyAxesToCamera(camFar, { ...ZERO, tx: 1 }, 100);

    // 100x more distance → ~100x more pan.
    expect(camFar.target[0] / camNear.target[0]).toBeCloseTo(100, 1);
  });

  it('ry is ignored (orbit camera has no roll)', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ry: 1 }, 100);
    expect(cam.yaw).toBe(0);
    expect(cam.pitch).toBe(0);
    expect(cam.distance).toBe(100);
    expect(cam.target[0]).toBe(0);
    expect(cam.target[1]).toBe(0);
    expect(cam.target[2]).toBe(0);
  });
});

describe('hasAnyAxis', () => {
  it('returns false for all-zero axes', () => {
    expect(hasAnyAxis(ZERO)).toBe(false);
  });

  it('returns true if any single axis is non-zero', () => {
    expect(hasAnyAxis({ ...ZERO, tx: 0.001 })).toBe(true);
    expect(hasAnyAxis({ ...ZERO, rz: -0.001 })).toBe(true);
  });
});
