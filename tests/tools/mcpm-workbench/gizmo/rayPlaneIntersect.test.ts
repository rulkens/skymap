import { describe, expect, it } from 'vitest';
import type { Ray } from '../../../../tools/mcpm-workbench/@types/Ray';
import { rayPlaneIntersect } from '../../../../tools/mcpm-workbench/src/gizmo/rayPlaneIntersect';

describe('rayPlaneIntersect', () => {
  it('returns a hand-computed point for a ray hitting an axis-aligned plane', () => {
    // Ray from (1,2,0) along +z; plane z=5 (point (0,0,5), normal +z).
    //   denom = dot([0,0,1],[0,0,1]) = 1
    //   numer = dot([0,0,5]-[1,2,0], [0,0,1]) = dot([-1,-2,5],[0,0,1]) = 5
    //   t = 5 ⇒ point = (1,2,0) + 5·(0,0,1) = (1,2,5)
    const ray: Ray = { origin: [1, 2, 0], dir: [0, 0, 1] };
    const hit = rayPlaneIntersect(ray, [0, 0, 5], [0, 0, 1]);
    expect(hit).not.toBeNull();
    expect(hit![0]).toBeCloseTo(1, 12);
    expect(hit![1]).toBeCloseTo(2, 12);
    expect(hit![2]).toBeCloseTo(5, 12);
  });

  it('returns null for a ray parallel to the plane', () => {
    // Ray along +x; plane normal +z ⇒ dot(dir, normal) = 0.
    const ray: Ray = { origin: [0, 0, 0], dir: [1, 0, 0] };
    expect(rayPlaneIntersect(ray, [0, 0, 5], [0, 0, 1])).toBeNull();
  });
});
