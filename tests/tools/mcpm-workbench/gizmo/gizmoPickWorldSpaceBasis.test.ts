import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { cameraBasis } from '../../../../tools/mcpm-workbench/src/render/cameraBasis';
import { screenToRay } from '../../../../tools/mcpm-workbench/src/gizmo/screenToRay';
import { gizmoHandleGeometry } from '../../../../tools/mcpm-workbench/src/gizmo/gizmoHandleGeometry';
import { pickGizmoHandle } from '../../../../tools/mcpm-workbench/src/gizmo/pickGizmoHandle';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';

// F2.3 review MAJOR: rayFromPointer (Viewport.tsx) is a closure, not exported, so this
// pins the two primitives it composes — cameraBasis + screenToRay — at exactly the values
// the fix and the pre-fix bug produce, rather than executing the closure itself.

const UNIT_AXES: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const ARROW_LENGTH_MPC = 2;

// Reachable today via importParams.ts's `vec4()` (spec §8), before any rotate-ring UI
// exists. gizmoHandleGeometry always uses UNIT_AXES in F1/F2.3 scope (world-space,
// independent of box.rotation), so the translate axis0 tip sits at world [2,0,0]
// regardless of this rotation.
const ROTATED_BOX: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [8, 8, 8],
  dims: [8, 8, 8],
  voxelSizeMpc: 1,
  rotation: quatFromAxisAngle([0, 1, 0], Math.PI / 2),
};

// eye/target chosen so NDC (0,0) — screenToRay's straight-ahead ray — points exactly at
// the axis0 translate handle tip [2,0,0], mirroring rayFromPointer's
// cameraBasis(...) -> screenToRay(..., ndc) pipeline.
const EYE_MPC: Vec3 = [2, 0, -10];
const TARGET_MPC: Vec3 = [2, 0, 0];
const UP_MPC: Vec3 = [0, 1, 0];

describe('gizmo pick ray world-space contract at a rotated GridBox (spec §5)', () => {
  it('hits the translate handle when cameraBasis gets an identity-rotation box copy (the fix)', () => {
    const geometry = gizmoHandleGeometry(ROTATED_BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    const basis = cameraBasis(EYE_MPC, TARGET_MPC, UP_MPC, {
      ...ROTATED_BOX,
      rotation: [0, 0, 0, 1],
    });
    const ray = screenToRay(EYE_MPC, basis, Math.PI / 2, 1, [0, 0]);

    expect(pickGizmoHandle(ray, geometry)).toEqual({ kind: 'translate', axis: 0 });
  });

  it('misses the same handle when cameraBasis gets the rotated box directly (the pre-fix bug)', () => {
    const geometry = gizmoHandleGeometry(ROTATED_BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    const basis = cameraBasis(EYE_MPC, TARGET_MPC, UP_MPC, ROTATED_BOX);
    const ray = screenToRay(EYE_MPC, basis, Math.PI / 2, 1, [0, 0]);

    expect(pickGizmoHandle(ray, geometry)).toBeNull();
  });
});
