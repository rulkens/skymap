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

// centerMpc=[1,2,3], sizeMpc=[8,8,8] ⇒ halfExtentMpc=[4,4,4]. ARROW_LENGTH_MPC is hand-picked
// (not derived from half — that's the point of F1.11) ⇒ translate axis0 tip at
// [1+2.4, 2, 3] = [3.4, 2, 3]; translate pick tolerance is
// PICK_TOLERANCE_FRACTION(0.05) * ARROW_LENGTH_MPC(2.4) = 0.12; resize pick tolerance stays
// box-based, PICK_TOLERANCE_FRACTION(0.05) * min(half)(4) = 0.2.
const ARROW_LENGTH_MPC = 2.4;
const BOX: GridBox = {
  centerMpc: [1, 2, 3],
  sizeMpc: [8, 8, 8],
  dims: [8, 8, 8],
  voxelSizeMpc: 1,
  rotation: [0, 0, 0, 1],
};

// dims at deriveGridBox's 8-voxel floor, voxelSizeMpc small ⇒ the smallest sane box:
// centerMpc=[0,0,0], sizeMpc=[4,4,4] ⇒ halfExtentMpc=[2,2,2]. SMALL_ARROW_LENGTH_MPC(1.2) ⇒
// translate axis0 tip at [1.2,0,0], translate tolerance 0.05*1.2=0.06; resize tolerance stays
// 0.05*min(half)(2)=0.1 — same fraction as the box above, since the resize formula is
// scale-invariant by construction. This exercises the smallest supported size specifically
// to catch a regression to an absolute (non-fraction) resize tolerance.
const SMALL_ARROW_LENGTH_MPC = 1.2;
const SMALL_BOX: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [4, 4, 4],
  dims: [8, 8, 8],
  voxelSizeMpc: 0.5,
  rotation: [0, 0, 0, 1],
};

describe('pickGizmoHandle', () => {
  it('hits a translate arrow when the ray is aimed at its tip', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    // Ray along +z through the translate-axis0 tip [3.4, 2, 3]: perpendicular distance 0.
    const ray: Ray = { origin: [3.4, 2, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'translate', axis: 0 });
  });

  it('hits a translate arrow when the ray grazes its shaft midpoint', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    // Translate axis0's shaft is the segment center[1,2,3] → tip[3.4,2,3] (length 2.4), so its
    // midpoint is [2.2,2,3]. Aim a +z ray at [2.2, 2.1, z] — 0.1 off the shaft in y, inside the
    // 0.12 tolerance (PICK_TOLERANCE_FRACTION(0.05)*ARROW_LENGTH_MPC(2.4)). The closest point on
    // the segment to this ray is its own midpoint [2.2,2,3] (segment param t=1.2, within
    // [0,2.4]), at perpendicular distance exactly 0.1. Point-only picking would measure this ray
    // only against the tip [3.4,2,3] — distance sqrt(1.2²+0.1²)≈1.20, outside tolerance — so
    // this ray would miss under point-only picking; the shaft segment test must hit.
    const ray: Ray = { origin: [2.2, 2.1, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'translate', axis: 0 });
  });

  it('does not pick past a translate arrow tip along the shaft line extension', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    // 1.0 beyond translate axis0's tip [3.4,2,3] along its own axis is [4.4,2,3] — outside the
    // segment (unclamped line param t=3.4 > length 2.4). Aim a +z ray at [4.4, 2.1, z] — only 0.1
    // off the line in y (inside the 0.12 tolerance if the line went unclamped). Clamped to the
    // segment, the nearest point is the tip [3.4,2,3]; distance from this ray to the tip is
    // sqrt(1.0²+0.1²)=sqrt(1.01)≈1.005 — outside tolerance, so the clamp must fire or this
    // wrongly hits translate axis0.
    const ray: Ray = { origin: [4.4, 2.1, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toBeNull();
  });

  it('returns null for a ray through the box interior that misses every handle', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    // Every translate shaft now starts AT the box center [1,2,3] and reaches only in its own
    // +axis direction, so a ray through the exact center would graze all three shafts at once
    // (distance 0) — that's the accepted "pick near center chooses some arrow" tradeoff, not an
    // empty-click case, so this test is re-aimed off-center rather than through it. [-1,0,z] sits
    // inside the box (bounds [-3,5]×[-2,6]×[-1,7]) but offset (Δx,Δy)=(-2,-2) from center in the
    // two axes every shaft/resize handle depends on; a +z ray there has a free z, so it measures
    // only that 2D offset against every handle: translate/resize shafts and points alike bottom
    // out at hypot(2,2)=2√2≈2.83 (worked per-axis: axis0/axis1 shafts are nearest at their t=0
    // center end; axis2's shaft and the z-axis resize points have z cancelled by the ray's free
    // z, leaving the same (Δx,Δy) offset) — comfortably outside both the 0.12 translate and 0.2
    // resize tolerances.
    const ray: Ray = { origin: [-1, 0, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toBeNull();
  });

  it('does not cross-hit a neighbouring resize handle at the smallest supported box size', () => {
    const geometry = gizmoHandleGeometry(SMALL_BOX, UNIT_AXES, SMALL_ARROW_LENGTH_MPC);
    // resize(axis0, +1) sits at [2,0,0] (center[0] + half[0]). Ray along +z through that point:
    // nearest neighbours are translate axis0's tip [1.2,0,0] (shaft-clamped distance 0.8, outside
    // the 0.06 translate tolerance) and resize(axis1,+1) [0,2,0] (distance sqrt(2²+2²)≈2.83,
    // outside the 0.1 resize tolerance) — both miss, so only the exact-hit resize wins.
    const ray: Ray = { origin: [2, 0, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'resize', axis: 0, sign: 1 });
  });

  it('never returns a rotate handle when every RingHandle has radiusMpc 0', () => {
    const geometry = gizmoHandleGeometry(SMALL_BOX, UNIT_AXES, SMALL_ARROW_LENGTH_MPC);
    expect(geometry.rotate.every((r) => r.radiusMpc === 0)).toBe(true);

    // Every rotate ring is centered at the box center [0,0,0], which is now also where every
    // translate shaft starts — a ray through the exact center would graze a shaft (distance 0)
    // before ever reaching rotate-ring logic, so this is re-aimed off-center rather than through
    // it (same reasoning as the box-interior null test above). [-0.4,-0.4,z] is offset
    // (Δx,Δy)=(-0.4,-0.4) from center; a +z ray there has a free z, so distance to any
    // translate/resize/ring-center point reduces to hypot(0.4,0.4)≈0.566 at best (axis0/axis1
    // shafts nearest at their t=0 center end; axis2's shaft and z-resize points have z cancelled
    // by the ray's free z) — outside both the 0.06 translate and 0.1 resize tolerances.
    // An implementation that ignored radiusMpc and picked rings by centerMpc alone would still
    // return null here (center itself is >tolerance away too); this pins that rotate stays inert
    // regardless, without the shaft coincidence at dead center.
    const ray: Ray = { origin: [-0.4, -0.4, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toBeNull();
  });
});
