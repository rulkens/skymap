import { describe, it, expect } from 'vitest';
import { createOrbitCamera } from '../../../src/services/camera/orbitCamera';
import { applyAxesToCamera, hasAnyAxis } from '../../../src/services/input/spaceMouseToCamera';
import type { SpaceMouseAxes } from '../../../src/services/input/spaceMouseAxes';

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

  // ── Zoom (now on ty, not tz) ───────────────────────────────────────────────

  it('positive ty (push forward) zooms IN (distance shrinks)', () => {
    // 3Dconnexion canonical: push forward = zoom in.
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ty: 1 }, 100);
    expect(cam.distance).toBeLessThan(100);
    expect(cam.distance).toBeGreaterThan(0); // never crosses through zero
  });

  it('negative ty (pull back) zooms OUT (distance grows)', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ty: -1 }, 100);
    expect(cam.distance).toBeGreaterThan(100);
  });

  it('zoom is exponential — repeated frames at fixed input compound multiplicatively', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ty: -1 }, 50); // pull back = zoom out
    const afterOne = cam.distance;
    applyAxesToCamera(cam, { ...ZERO, ty: -1 }, 50);
    const afterTwo = cam.distance;

    // Linear zoom would give afterTwo - afterOne === afterOne - 100. Exponential
    // zoom gives afterTwo / afterOne === afterOne / 100 (constant ratio).
    expect(afterTwo / afterOne).toBeCloseTo(afterOne / 100, 4);
  });

  it('tz does NOT zoom (tz only pans vertically now)', () => {
    // Regression: tz used to be zoom; it must not affect distance anymore.
    const cam = makeCam();
    const distBefore = cam.distance;
    applyAxesToCamera(cam, { ...ZERO, tz: 1 }, 100);
    expect(cam.distance).toBeCloseTo(distBefore, 6);
  });

  it('ty does NOT pan the target (ty only zooms now)', () => {
    // Regression: ty used to pan up/down; it must not move the target anymore.
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ty: 1 }, 100);
    expect(cam.target[0]).toBeCloseTo(0, 6);
    expect(cam.target[1]).toBeCloseTo(0, 6);
    expect(cam.target[2]).toBeCloseTo(0, 6);
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

  // ── Pan vertical (now on tz, not ty) ──────────────────────────────────────

  it('positive tz (lift puck) pans the target along world +Y at pitch=0', () => {
    // 3Dconnexion canonical: lift = pan up. At pitch=0 the up vector is (0,1,0).
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, tz: 1 }, 100);
    expect(cam.target[0]).toBeCloseTo(0, 6);
    expect(cam.target[1]).toBeGreaterThan(0);
    expect(cam.target[2]).toBeCloseTo(0, 6);
  });

  it('negative tz (push puck down) pans the target along world -Y at pitch=0', () => {
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, tz: -1 }, 100);
    expect(cam.target[0]).toBeCloseTo(0, 6);
    expect(cam.target[1]).toBeLessThan(0);
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

  // ── Roll (now on ry) ───────────────────────────────────────────────────────

  it('positive ry (tilt right) changes cam.roll', () => {
    // ry should now drive roll — it must no longer be silently ignored.
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ry: 1 }, 100);
    // roll should have changed from its undefined/0 starting point.
    expect(cam.roll).not.toBeUndefined();
    expect(cam.roll).not.toBe(0);
  });

  it('ry roll magnitude scales with dt', () => {
    const cam1 = makeCam();
    applyAxesToCamera(cam1, { ...ZERO, ry: 1 }, 100);

    const cam2 = makeCam();
    applyAxesToCamera(cam2, { ...ZERO, ry: 1 }, 200);

    // Double the dt → double the roll change.
    expect(Math.abs(cam2.roll ?? 0)).toBeCloseTo(Math.abs(cam1.roll ?? 0) * 2, 6);
  });

  it('positive ry produces negative roll (puck tilts right → camera tilts CW)', () => {
    // Sign convention: we negate ry so that tilting the puck top-right (ry > 0)
    // rolls the camera CW (negative roll in our convention), matching the
    // intuitive "puck leans right, view leans right" feel.
    const cam = makeCam();
    applyAxesToCamera(cam, { ...ZERO, ry: 1 }, 100);
    expect(cam.roll).toBeLessThan(0);
  });

  it('ry = 0 does not affect cam.roll', () => {
    const cam = makeCam();
    cam.roll = 0.5; // pre-existing roll
    applyAxesToCamera(cam, { ...ZERO, ry: 0 }, 100);
    expect(cam.roll).toBeCloseTo(0.5, 6);
  });

  it('ry does not affect other camera state (yaw, pitch, distance, target)', () => {
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
