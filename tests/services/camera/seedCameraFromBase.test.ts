/**
 * seedCameraFromBase — unit tests for the drag-register seeder.
 *
 * `seedCameraFromBase` copies the four orbit parameters (target, yaw, pitch,
 * distance) from a `CameraPose` onto the live `OrbitCamera` drag register and
 * recomputes `cam.position` via `updatePosition`. Tests pin:
 *
 *   - The four orbit params are transferred correctly.
 *   - `cam.target` is populated element-by-element (never aliased — mutations
 *     to the source `pose.target` after the call must not affect `cam.target`).
 *   - `cam.position` is recomputed (moves off a zeroed seed).
 *   - Projection fields (fovYRad, aspect, near, far) are untouched.
 */

import { describe, it, expect } from 'vitest';
import { seedCameraFromBase } from '../../../src/services/camera/seedCameraFromBase';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';

function makeCam(): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 1,
    yaw: 0,
    pitch: 0,
    fovYRad: 1,
    aspect: 1.5,
    near: 0.01,
    far: 50000,
  });
}

const POSE: CameraPose = {
  target: [10, 20, 30],
  yaw: 1.23,
  pitch: -0.45,
  distance: 77,
};

describe('seedCameraFromBase', () => {
  it('copies yaw, pitch, and distance from the pose', () => {
    const cam = makeCam();
    seedCameraFromBase(cam, POSE);
    expect(cam.yaw).toBe(1.23);
    expect(cam.pitch).toBe(-0.45);
    expect(cam.distance).toBe(77);
  });

  it('copies target element-by-element', () => {
    const cam = makeCam();
    seedCameraFromBase(cam, POSE);
    expect(cam.target[0]).toBe(10);
    expect(cam.target[1]).toBe(20);
    expect(cam.target[2]).toBe(30);
  });

  it('does not alias pose.target — mutations to the source after the call do not affect cam.target', () => {
    const mutablePose: CameraPose = { target: [1, 2, 3], yaw: 0, pitch: 0, distance: 10 };
    const cam = makeCam();
    seedCameraFromBase(cam, mutablePose);
    // Mutate the source after seeding.
    (mutablePose.target as number[])[0] = 999;
    // cam.target must be unchanged.
    expect(cam.target[0]).toBe(1);
  });

  it('recomputes cam.position (moves off the initial zero seed)', () => {
    const cam = makeCam();
    // After construction, position is distance*dir(yaw=0,pitch=0) = [0,0,1].
    // After seeding yaw=1.23, pitch=-0.45, distance=77, position should change.
    const positionBefore = [cam.position[0], cam.position[1], cam.position[2]];
    seedCameraFromBase(cam, POSE);
    const positionAfter = [cam.position[0], cam.position[1], cam.position[2]];
    // Position must have changed (distance 1 → 77, different angles).
    expect(positionAfter).not.toEqual(positionBefore);
    // Distance 77 means |position - target| ≈ 77.
    const dx = cam.position[0]! - POSE.target[0];
    const dy = cam.position[1]! - POSE.target[1];
    const dz = cam.position[2]! - POSE.target[2];
    expect(Math.sqrt(dx * dx + dy * dy + dz * dz)).toBeCloseTo(77, 3);
  });

  it('leaves projection fields (fovYRad, aspect, near, far) unchanged', () => {
    const cam = makeCam();
    const savedFov = cam.fovYRad;
    const savedAspect = cam.aspect;
    const savedNear = cam.near;
    const savedFar = cam.far;
    seedCameraFromBase(cam, POSE);
    expect(cam.fovYRad).toBe(savedFov);
    expect(cam.aspect).toBe(savedAspect);
    expect(cam.near).toBe(savedNear);
    expect(cam.far).toBe(savedFar);
  });
});
