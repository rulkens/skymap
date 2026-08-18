import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import type { Ray } from '../../../../tools/mcpm-workbench/@types/Ray';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { gizmoHandleGeometry } from '../../../../tools/mcpm-workbench/src/gizmo/gizmoHandleGeometry';
import { pickGizmoHandle } from '../../../../tools/mcpm-workbench/src/gizmo/pickGizmoHandle';

const UNIT_AXES: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// centerMpc=[1,2,3], sizeMpc=[8,8,8] ⇒ halfExtentMpc=[4,4,4]; translate axis0 tip at
// [1+0.6*4, 2, 3] = [3.4, 2, 3].
const BOX: GridBox = {
  centerMpc: [1, 2, 3],
  sizeMpc: [8, 8, 8],
  dims: [8, 8, 8],
  voxelSizeMpc: 1,
};

// dims at deriveGridBox's 8-voxel floor, voxelSizeMpc small ⇒ the smallest sane box:
// centerMpc=[0,0,0], sizeMpc=[4,4,4] ⇒ halfExtentMpc=[2,2,2]. Pick tolerance is
// PICK_TOLERANCE_FRACTION(0.05) * min(half) = 0.1, same fraction as the box above — the
// formula is scale-invariant by construction, so this exercises the smallest supported size
// specifically to catch a regression to an absolute (non-fraction) tolerance.
const SMALL_BOX: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [4, 4, 4],
  dims: [8, 8, 8],
  voxelSizeMpc: 0.5,
};

describe('pickGizmoHandle', () => {
  it('hits a translate arrow when the ray is aimed at its tip', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES);
    // Ray along +z through the translate-axis0 tip [3.4, 2, 3]: perpendicular distance 0.
    const ray: Ray = { origin: [3.4, 2, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'translate', axis: 0 });
  });

  it('returns null for a ray through the box center between handles', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES);
    // Diagonal ray through the exact center [1,2,3] (t=10*sqrt(3) from the origin below), so it
    // isn't coincidentally collinear with any single-axis handle. Hand-computed distance to the
    // nearest handle (translate axis0 tip [3.4,2,3]): closest point on the ray to that point is
    // [1.8, 2.8, 3.8] (t≈18.71), distance sqrt(1.6²+0.8²+0.8²)=sqrt(3.84)≈1.96 — far outside the
    // 0.2 tolerance (PICK_TOLERANCE_FRACTION(0.05)*half(4)), and every other handle is farther
    // still by the same symmetry.
    const dir = 1 / Math.sqrt(3);
    const ray: Ray = { origin: [-9, -8, -7], dir: [dir, dir, dir] };

    expect(pickGizmoHandle(ray, geometry)).toBeNull();
  });

  it('does not cross-hit a neighbouring resize handle at the smallest supported box size', () => {
    const geometry = gizmoHandleGeometry(SMALL_BOX, UNIT_AXES);
    // resize(axis0, +1) sits at [2,0,0] (center[0] + half[0]). Ray along +z through that point:
    // nearest neighbours are translate axis0's tip [1.2,0,0] (distance 0.8) and
    // resize(axis1,+1) [0,2,0] (distance sqrt(2²+2²)≈2.83) — both far outside the 0.1 tolerance.
    const ray: Ray = { origin: [2, 0, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'resize', axis: 0, sign: 1 });
  });

  it('never returns a rotate handle when every RingHandle has radiusMpc 0', () => {
    const geometry = gizmoHandleGeometry(SMALL_BOX, UNIT_AXES);
    expect(geometry.rotate.every((r) => r.radiusMpc === 0)).toBe(true);

    // Ray through the box's exact center [0,0,0] — where every rotate ring is centered — along a
    // direction not aligned with any single axis, so it isn't coincidentally on top of a
    // translate/resize handle either (nearest is translate axis0's tip [1.2,0,0] at distance 1.2,
    // well outside the 0.1 tolerance). An implementation that ignored radiusMpc and picked rings
    // by centerMpc alone would return {kind:'rotate',...} here; the real one returns null.
    const d = 1 / Math.sqrt(2);
    const ray: Ray = { origin: [0, -10, -10], dir: [0, d, d] };

    expect(pickGizmoHandle(ray, geometry)).toBeNull();
  });
});
