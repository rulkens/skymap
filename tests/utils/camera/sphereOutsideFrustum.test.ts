/**
 * sphereOutsideFrustum — conservative sphere-vs-frustum cull tests.
 *
 * Every fixture's `planes` come from `frustumPlanesFromViewProj` fed a REAL
 * perspective view-projection (Task 1 is trusted), and every verdict is
 * hand-reasoned from the frustum's geometry — never recomputed from the same
 * dot-product the util runs (that would be a mirror test that passes even if
 * both sides share a sign bug). The geometry we lean on for the standard
 * fixture: eye at (0,0,5) looking down -z at the origin, 60° vertical FOV,
 * square aspect, near 0.1 / far 100. That puts the near clip at z≈4.9, the far
 * clip at z≈-95, and a symmetric side half-width of 5·tan(30°) ≈ 2.887 at the
 * z=0 plane where the origin sits.
 *
 * The cases pin both directions of the conservative-cull contract: clearly
 * separated spheres MUST report outside (the win — they skip vertex work), and
 * anything touching the frustum (inside, straddling, or at the camera apex)
 * MUST report kept, because a false negative would drop visible geometry.
 */

import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { frustumPlanesFromViewProj } from '../../../src/utils/camera/frustumPlanesFromViewProj';
import { sphereOutsideFrustum } from '../../../src/utils/camera/sphereOutsideFrustum';

// The standard fixture shared by the inside / behind / lateral / straddle
// cases: a real off-origin perspective frustum with hand-computable bounds.
const standardFrustum = () => {
  const proj = mat4.perspective(Math.PI / 3, 1, 0.1, 100);
  const view = mat4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  const vp = mat4.multiply(proj, view) as Float32Array;
  return frustumPlanesFromViewProj(vp);
};

describe('sphereOutsideFrustum', () => {
  it('a small sphere centred inside the frustum is not outside', () => {
    const planes = standardFrustum();
    // Origin is on-axis, 5 units deep — comfortably inside every plane, the
    // nearest boundary ~2.5 units away, far larger than the 0.1 radius.
    expect(sphereOutsideFrustum(planes, 0, 0, 0, 0.1)).toBe(false);
  });

  it('a sphere behind the near plane is outside', () => {
    const planes = standardFrustum();
    // Camera sits at z=5 looking toward -z; z=10 is 5 units BEHIND the eye,
    // far behind the near clip at z≈4.9.
    expect(sphereOutsideFrustum(planes, 0, 0, 10, 0.1)).toBe(true);
  });

  it('a sphere far to the left is outside', () => {
    const planes = standardFrustum();
    // At the z=0 plane the frustum half-width is ~2.887; x=-100 is nowhere near.
    expect(sphereOutsideFrustum(planes, -100, 0, 0, 0.5)).toBe(true);
  });

  it('a sphere far to the right is outside', () => {
    const planes = standardFrustum();
    expect(sphereOutsideFrustum(planes, 100, 0, 0, 0.5)).toBe(true);
  });

  it('a sphere far above is outside', () => {
    const planes = standardFrustum();
    expect(sphereOutsideFrustum(planes, 0, 100, 0, 0.5)).toBe(true);
  });

  it('a sphere far below is outside', () => {
    const planes = standardFrustum();
    expect(sphereOutsideFrustum(planes, 0, -100, 0, 0.5)).toBe(true);
  });

  it('a sphere straddling the right plane is not outside (conservative keep)', () => {
    const planes = standardFrustum();
    // x=3 sits just past the ~2.887 half-width at z=0, so its centre is outside
    // the right plane by ~0.1 and inside all five others. A tiny radius leaves
    // it fully outside; a radius large enough to reach back across the plane
    // makes the sphere overlap the frustum and MUST be kept.
    expect(sphereOutsideFrustum(planes, 3, 0, 0, 0.001)).toBe(true);
    expect(sphereOutsideFrustum(planes, 3, 0, 0, 5)).toBe(false);
  });

  it('a sphere at the camera origin is never outside, whatever the orientation', () => {
    // The rebased NEAR0 frame puts the camera AT the world origin. The four
    // lateral planes pass through the camera apex, so the origin is exactly on
    // them (signed distance 0); the only plane it fails is the near clip, by
    // exactly the near distance (0.1). Any node whose radius reaches the near
    // clip therefore straddles it and is kept — and since that near distance is
    // 0.1 for every camera orientation, the keep holds regardless of look dir.
    const orientations: Array<[number, number, number]> = [
      [0, 0, -1],
      [1, 0, 0],
      [0.3, 0.2, -1],
      [-1, -1, -1],
    ];
    for (const [lx, ly, lz] of orientations) {
      const proj = mat4.perspective(Math.PI / 3, 1, 0.1, 100);
      const view = mat4.lookAt([0, 0, 0], [lx, ly, lz], [0, 1, 0]);
      const vp = mat4.multiply(proj, view) as Float32Array;
      const planes = frustumPlanesFromViewProj(vp);
      // Radius 1 comfortably exceeds the 0.1 near distance.
      expect(sphereOutsideFrustum(planes, 0, 0, 0, 1)).toBe(false);
    }
  });
});
