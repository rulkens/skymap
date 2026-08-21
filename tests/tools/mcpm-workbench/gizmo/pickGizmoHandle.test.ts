import { describe, expect, it } from 'vitest';
import type { GizmoHandleGeometry } from '../../../../tools/mcpm-workbench/@types/GizmoHandleGeometry';
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
    // Every translate shaft starts AT the box center [1,2,3] and reaches only in its own
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

  it('hits a rotate ring when the ray is aimed at a point on its circle', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    // Ring radius: RING_RADIUS_ARROW_MULTIPLE(1.3) * ARROW_LENGTH_MPC(2.4) = 3.12.
    // The axis2 ring (normal [0,0,1]) lies in the z=3 plane; pick a point on its circle at 45°
    // (not axis-aligned, so it doesn't coincide with any translate arrow's own shaft line):
    // [1 + 3.12·cos45°, 2 + 3.12·sin45°, 3]. A ray straight along +z through that (x,y) hits the
    // ring's own plane exactly there (perpendicular distance 0), and sits >2.2 Mpc from every
    // other handle — comfortably outside the 0.12 tolerance every candidate but the ring clears.
    const off = 3.12 * Math.SQRT1_2;
    const ray: Ray = { origin: [1 + off, 2 + off, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'rotate', axis: 2 });
  });

  it('returns null for a ray that misses every ring circle (aimed at empty space near the box)', () => {
    const geometry = gizmoHandleGeometry(SMALL_BOX, UNIT_AXES, SMALL_ARROW_LENGTH_MPC);
    // Every rotate ring is centered at the box center [0,0,0], which is also where every
    // translate shaft starts — a ray through the exact center would graze a shaft (distance 0)
    // before ever reaching rotate-ring logic, so this is re-aimed off-center rather than through
    // it (same reasoning as the box-interior null test above). [-0.4,-0.4,z] is offset
    // (Δx,Δy)=(-0.4,-0.4) from center; a +z ray there has a free z, so distance to any
    // translate/resize/ring-center point reduces to hypot(0.4,0.4)≈0.566 at best (axis0/axis1
    // shafts nearest at their t=0 center end; axis2's shaft and z-resize points have z cancelled
    // by the ray's free z) — outside the 0.06 translate/ring and 0.1 resize tolerances. Ring
    // radius here is RING_RADIUS_ARROW_MULTIPLE(1.3) * SMALL_ARROW_LENGTH_MPC(1.2) = 1.56, so the
    // axis2 ring's plane-hit distance from its circle is |0.566 - 1.56| ≈ 0.994 — also a miss.
    const ray: Ray = { origin: [-0.4, -0.4, -10], dir: [0, 0, 1] };

    expect(pickGizmoHandle(ray, geometry)).toBeNull();
  });

  it('falls back to center-point distance when the ray is parallel to the ring plane (minor 3)', () => {
    // A ring-only fixture: every OTHER handle sits far from the ray (near [0,0,100], where
    // the ray's fixed y=3/z=2 puts them ~98 Mpc away — outside any tolerance below), so only
    // the axis2 ring (centerMpc=[0,0,0], the one under test) can register a hit. This proves
    // pickGizmoHandle's near-parallel fallback branch is reachable AND correct, not just that
    // distanceToRing computes the right number in isolation.
    //
    // ring.axisDir=[0,0,1] (plane z=0); ray.dir=[1,0,0] is exactly perpendicular to axisDir
    // (dot=0), so rayPlaneIntersect returns null and the fallback is distanceToRay(ray,
    // ring.centerMpc). Hand-computed: p = center-origin = [10,-3,-2], t = dot(p,dir) = 10
    // (>=0, unclamped), closest = origin + dir*10 = [0,3,2], distance = hypot(0-0, 0-3, 0-2) =
    // sqrt(9+4) = sqrt(13) ≈ 3.606. arrowTolerance = PICK_TOLERANCE_FRACTION(0.05) *
    // arrowLength(100) = 5, so this is a hit. radiusMpc=100 makes the WRONG fallback
    // (`|distanceToRay − radius|` ≈ 96.4) miss instead — the fixture only passes for the
    // correct formula, not the near-miss alternative.
    const FAR: Vec3 = [0, 0, 100];
    const ray: Ray = { origin: [-10, 3, 2], dir: [1, 0, 0] };
    const geometry: GizmoHandleGeometry = {
      translate: [
        { id: { kind: 'translate', axis: 0 }, positionMpc: [100, 0, 100], axisDir: [1, 0, 0] },
        { id: { kind: 'translate', axis: 1 }, positionMpc: [0, 100, 100], axisDir: [0, 1, 0] },
        { id: { kind: 'translate', axis: 2 }, positionMpc: [0, 0, 200], axisDir: [0, 0, 1] },
      ],
      resize: [
        { id: { kind: 'resize', axis: 0, sign: 1 }, positionMpc: [10, 0, 100], axisDir: [1, 0, 0] },
        {
          id: { kind: 'resize', axis: 0, sign: -1 },
          positionMpc: [-10, 0, 100],
          axisDir: [1, 0, 0],
        },
        { id: { kind: 'resize', axis: 1, sign: 1 }, positionMpc: [0, 10, 100], axisDir: [0, 1, 0] },
        {
          id: { kind: 'resize', axis: 1, sign: -1 },
          positionMpc: [0, -10, 100],
          axisDir: [0, 1, 0],
        },
        { id: { kind: 'resize', axis: 2, sign: 1 }, positionMpc: [0, 0, 110], axisDir: [0, 0, 1] },
        { id: { kind: 'resize', axis: 2, sign: -1 }, positionMpc: [0, 0, 90], axisDir: [0, 0, 1] },
      ],
      rotate: [
        { id: { kind: 'rotate', axis: 0 }, centerMpc: FAR, axisDir: [1, 0, 0], radiusMpc: 10 },
        { id: { kind: 'rotate', axis: 1 }, centerMpc: FAR, axisDir: [0, 1, 0], radiusMpc: 10 },
        {
          id: { kind: 'rotate', axis: 2 },
          centerMpc: [0, 0, 0],
          axisDir: [0, 0, 1],
          radiusMpc: 100,
        },
      ],
    };

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'rotate', axis: 2 });
  });
});
