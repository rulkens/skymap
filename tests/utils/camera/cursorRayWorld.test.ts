/**
 * cursorRayWorld — cursor CSS position → camera-eye ray in world Mpc.
 *
 *   ndcX = 2·x/width − 1, ndcY = 1 − 2·y/height   (CSS Y down, NDC Y up)
 *   direction = normalize(forward + ndcX·tanHalfFovY·aspect·right + ndcY·tanHalfFovY·up)
 *
 * The centre case pins `ndcX = ndcY = 0` collapsing to `forward` exactly; the
 * corner case hand-computes a full basis expansion so a sign or axis swap in
 * the NDC-to-world formula fails here, not downstream in the surface hit.
 */

import { describe, it, expect } from 'vitest';
import { cursorRayWorld } from '../../../src/utils/camera/cursorRayWorld';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('cursorRayWorld', () => {
  it('screen centre returns forward unchanged, independent of fovYRad/aspect', () => {
    const forward = ((): Vec3 => {
      const v: Vec3 = [0.4, -0.2, -0.9];
      const l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    })();
    const upRef: Vec3 = [0, 1, 0];
    const camPosMpc: Vec3 = [5, 6, 7];

    const ray = cursorRayWorld(
      { x: 400, y: 300 },
      { width: 800, height: 600 },
      camPosMpc,
      forward,
      0,
      upRef,
      Math.PI / 3,
      1.9,
    );

    expect(ray.direction[0]).toBeCloseTo(forward[0], 12);
    expect(ray.direction[1]).toBeCloseTo(forward[1], 12);
    expect(ray.direction[2]).toBeCloseTo(forward[2], 12);
  });

  it('a hand-picked corner matches normalize(forward - right + up)', () => {
    // fovYRad = 90° ⇒ tanHalfFovY = 1; aspect = 1; roll = 0. Cursor at CSS
    // (0, 0) (top-left) ⇒ ndcX = -1, ndcY = 1.
    // forward = [0,0,-1], upRef = [0,1,0] ⇒ imagePlaneBasis gives
    // right = [1,0,0], up = [0,1,0] (the identity-forward case).
    const forward: Vec3 = [0, 0, -1];
    const upRef: Vec3 = [0, 1, 0];

    const ray = cursorRayWorld(
      { x: 0, y: 0 },
      { width: 800, height: 600 },
      [0, 0, 0],
      forward,
      0,
      upRef,
      Math.PI / 2,
      1,
    );

    // normalize([-1, 1, -1])
    const l = Math.sqrt(3);
    expect(ray.direction[0]).toBeCloseTo(-1 / l, 12);
    expect(ray.direction[1]).toBeCloseTo(1 / l, 12);
    expect(ray.direction[2]).toBeCloseTo(-1 / l, 12);
  });

  it('origin equals camPosMpc exactly — the ray starts at the eye', () => {
    const camPosMpc: Vec3 = [12.5, -3.25, 900.125];
    const ray = cursorRayWorld(
      { x: 123, y: 45 },
      { width: 1024, height: 768 },
      camPosMpc,
      [0, 0, -1],
      0,
      [0, 1, 0],
      Math.PI / 4,
      1.33,
    );

    expect(ray.origin).toEqual(camPosMpc);
  });
});
