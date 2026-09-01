/**
 * poseOf — unit tests for the orbit-param extractor.
 *
 * Confirms the four orbit params are lifted faithfully, that the target
 * array is a fresh copy (no aliasing), and that the input camera is not
 * mutated.
 */

import { describe, it, expect } from 'vitest';

import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import { poseOf } from '../../../../src/services/engine/camera/poseOf';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';

const makeCam = (): OrbitCamera =>
  ({
    target: [1, 2, 3] as [number, number, number],
    yaw: 0.5,
    pitch: -0.3,
    distance: 150,
    // projection fields present but irrelevant to poseOf
    fovYRad: Math.PI / 4,
    aspect: 1.5,
    near: 0.1,
    far: 10000,
    position: [0, 0, 150],
  }) as OrbitCamera;

describe('poseOf', () => {
  it('returns the four orbit params', () => {
    const cam = makeCam();
    const pose = poseOf(cam);

    expect(pose.target).toEqual([1, 2, 3]);
    expect(pose.yaw).toBe(0.5);
    expect(pose.pitch).toBe(-0.3);
    expect(pose.distance).toBe(150);
  });

  it("returns a fresh target array — not the camera's", () => {
    const cam = makeCam();
    const pose = poseOf(cam);

    expect(pose.target).not.toBe(cam.target);
  });

  it('does not mutate the input camera', () => {
    const cam = makeCam();
    const before = { ...cam, target: [...cam.target] };

    poseOf(cam);

    expect(cam.target).toEqual(before.target);
    expect(cam.yaw).toBe(before.yaw);
    expect(cam.pitch).toBe(before.pitch);
    expect(cam.distance).toBe(before.distance);
  });
});

describe('poseOf → assembleOrbitCamera round trip (P5)', () => {
  it('carries a non-zero roll from a live camera onto the reassembled camera', () => {
    const cam = makeCam();
    cam.roll = 0.42;

    const pose = poseOf(cam);
    expect(pose.roll).toBe(0.42);

    const projection: CameraProjection = { fovYRad: 1, aspect: 1.5, near: 0.1, far: 1000 };
    const identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const reassembled = assembleOrbitCamera(pose, projection, identity, identity);

    expect(reassembled.roll).toBe(0.42);
  });
});
