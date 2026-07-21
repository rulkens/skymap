/**
 * frustumPlanesFromViewProj — Gribb–Hartmann plane-extraction tests.
 *
 * The identity case pins the sign convention and packing order against a
 * hand-derived answer (identity vp ⇒ the clip cube's own faces), so a flipped
 * row-add or a column/row transpose bug is caught without re-running the same
 * math the util does. The perspective cases exercise a real (non-trivial)
 * view-projection: unit-length normals prove the normalization actually ran,
 * and the inside-point case proves the outward/inward sign is right for a
 * genuine frustum (not just the symmetric identity). The out-array case pins
 * the allocation-free reuse contract by reference identity.
 */

import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { frustumPlanesFromViewProj } from '../../../src/utils/camera/frustumPlanesFromViewProj';

// Plane slot layout inside the packed 24-float output: left, right, bottom,
// top, near, far — each a contiguous (nx, ny, nz, d) quad.
const LEFT = 0;
const RIGHT = 4;
const BOTTOM = 8;
const TOP = 12;

describe('frustumPlanesFromViewProj', () => {
  it('extracts six planes from an identity vp', () => {
    const planes = frustumPlanesFromViewProj(mat4.identity() as Float32Array);

    // Identity ⇒ clip = pos, so the frustum IS the clip cube. The left face is
    // x ≥ -1 ⇒ (1,0,0)·p + 1 ≥ 0; the right face is x ≤ 1 ⇒ (-1,0,0)·p + 1 ≥ 0.
    expect(planes[LEFT + 0]).toBeCloseTo(1, 6);
    expect(planes[LEFT + 1]).toBeCloseTo(0, 6);
    expect(planes[LEFT + 2]).toBeCloseTo(0, 6);
    expect(planes[LEFT + 3]).toBeCloseTo(1, 6);

    expect(planes[RIGHT + 0]).toBeCloseTo(-1, 6);
    expect(planes[RIGHT + 3]).toBeCloseTo(1, 6);

    // Bottom face y ≥ -1 ⇒ (0,1,0), top face y ≤ 1 ⇒ (0,-1,0).
    expect(planes[BOTTOM + 1]).toBeCloseTo(1, 6);
    expect(planes[TOP + 1]).toBeCloseTo(-1, 6);
  });

  it('normals are unit length', () => {
    const proj = mat4.perspective(Math.PI / 3, 16 / 9, 0.1, 100);
    const view = mat4.lookAt([3, 2, 5], [0, 0, 0], [0, 1, 0]);
    const vp = mat4.multiply(proj, view) as Float32Array;

    const planes = frustumPlanesFromViewProj(vp);

    for (let p = 0; p < 6; p++) {
      const nx = planes[p * 4 + 0]!;
      const ny = planes[p * 4 + 1]!;
      const nz = planes[p * 4 + 2]!;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
    }
  });

  it('a point known in front has positive signed distance to every plane', () => {
    // Eye at (0,0,5) looking at the origin: a point at the origin sits on-axis
    // and 5 units deep, comfortably inside [near=0.1, far=100].
    const proj = mat4.perspective(Math.PI / 3, 1, 0.1, 100);
    const view = mat4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const vp = mat4.multiply(proj, view) as Float32Array;

    const planes = frustumPlanesFromViewProj(vp);

    const px = 0;
    const py = 0;
    const pz = 0;
    for (let p = 0; p < 6; p++) {
      const signed =
        planes[p * 4 + 0]! * px +
        planes[p * 4 + 1]! * py +
        planes[p * 4 + 2]! * pz +
        planes[p * 4 + 3]!;
      expect(signed).toBeGreaterThan(0);
    }
  });

  it('writes into the out array and returns it', () => {
    const out = new Float32Array(24);
    const returned = frustumPlanesFromViewProj(mat4.identity() as Float32Array, out);
    expect(returned).toBe(out);
  });

  it('reversed-Z infinite-far vp never reports an in-view point outside (degenerate z row)', () => {
    // Production shape: NEAR0's foreground slab builds vp via
    // mat4d.perspectiveReverseZ(fovYRad, aspect, near) — zFar omitted, so the
    // z-row of vp collapses to (0, 0, 0, zNear), a zero-length normal that
    // setPlane's guard maps to the all-zero plane. That guard is the SAFE
    // direction: an all-zero plane reports every point as "inside" (dot
    // product is always 0, which passes `>= 0`). The unsafe failure mode
    // would be the guard instead reporting real in-view points as outside,
    // which would cull the entire starfield behind this degenerate plane.
    const fovYRad = Math.PI / 3;
    const aspect = 1;
    const near = 0.1;
    // omit zFar so wgpu-matrix takes the infinite-far branch (zFar defaults
    // to Infinity in perspectiveReverseZ).
    const proj = mat4.perspectiveReverseZ(fovYRad, aspect, near);
    const view = mat4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
    const vp = mat4.multiply(proj, view) as Float32Array;

    const planes = frustumPlanesFromViewProj(vp);

    const assertInside = (px: number, py: number, pz: number) => {
      for (let p = 0; p < 6; p++) {
        const signed =
          planes[p * 4 + 0]! * px +
          planes[p * 4 + 1]! * py +
          planes[p * 4 + 2]! * pz +
          planes[p * 4 + 3]!;
        expect(signed).toBeGreaterThanOrEqual(0);
      }
    };

    // Comfortably inside: on-axis, well past near, nowhere near a finite far.
    assertInside(0, 0, -5);

    // Extremely far along the view direction, inside laterally (offset scales
    // with depth so it stays inside the symmetric frustum's side planes).
    // Under infinite-far reversed-Z nothing should ever far-clip this point.
    const depth = 1e10;
    const halfWidthAtDepth = depth * Math.tan(fovYRad / 2) * aspect;
    assertInside(0.3 * halfWidthAtDepth, 0.3 * halfWidthAtDepth, -depth);
  });
});
