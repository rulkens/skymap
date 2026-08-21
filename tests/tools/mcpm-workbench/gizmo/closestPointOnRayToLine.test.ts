import { describe, expect, it } from 'vitest';
import type { Ray } from '../../../../tools/mcpm-workbench/@types/Ray';
import { closestPointOnRayToLine } from '../../../../tools/mcpm-workbench/src/gizmo/closestPointOnRayToLine';

describe('closestPointOnRayToLine', () => {
  it('returns a hand-computed t for two skew lines', () => {
    // Ray = +z axis through the origin. Line = +x through (1,1,0).
    // Ray point (0,0,t), line point (1+s,1,0); dist² = (1+s)²+1+t².
    // Minimising over s gives s=-1 (t along the line = -1); over t gives t=0.
    const ray: Ray = { origin: [0, 0, 0], dir: [0, 0, 1] };
    const t = closestPointOnRayToLine(ray, [1, 1, 0], [1, 0, 0]);
    expect(t).toBeCloseTo(-1, 12);
  });

  it('returns 0 when the ray origin is already the closest point', () => {
    // Ray = +z axis through the origin. Line = +y through (3,0,0).
    // Ray point (0,0,t), line point (3,s,0); dist² = 9+s²+t², minimised
    // at s=0 (i.e. the line's own origin) and t=0.
    const ray: Ray = { origin: [0, 0, 0], dir: [0, 0, 1] };
    const t = closestPointOnRayToLine(ray, [3, 0, 0], [0, 1, 0]);
    expect(t).toBeCloseTo(0, 12);
  });
});
