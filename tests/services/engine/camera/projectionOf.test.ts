/**
 * projectionOf — unit tests for the lens/frustum extractor.
 *
 * Confirms the four projection numbers are lifted faithfully and that the
 * input camera is not mutated. The mirror of poseOf's tests.
 */

import { describe, it, expect } from 'vitest';

import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import { projectionOf } from '../../../../src/services/engine/camera/projectionOf';

const makeCam = (): OrbitCamera =>
  ({
    target: [1, 2, 3] as [number, number, number],
    yaw: 0.5,
    pitch: -0.3,
    distance: 150,
    fovYRad: Math.PI / 4,
    aspect: 1.5,
    near: 0.1,
    far: 10000,
    position: [0, 0, 150],
  }) as OrbitCamera;

describe('projectionOf', () => {
  it('returns the four projection fields', () => {
    const cam = makeCam();
    const projection = projectionOf(cam);

    expect(projection.fovYRad).toBe(Math.PI / 4);
    expect(projection.aspect).toBe(1.5);
    expect(projection.near).toBe(0.1);
    expect(projection.far).toBe(10000);
  });

  it('does not mutate the input camera', () => {
    const cam = makeCam();
    const before = { ...cam };

    projectionOf(cam);

    expect(cam.fovYRad).toBe(before.fovYRad);
    expect(cam.aspect).toBe(before.aspect);
    expect(cam.near).toBe(before.near);
    expect(cam.far).toBe(before.far);
  });
});
