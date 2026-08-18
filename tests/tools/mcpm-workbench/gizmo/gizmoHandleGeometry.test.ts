import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { gizmoHandleGeometry } from '../../../../tools/mcpm-workbench/src/gizmo/gizmoHandleGeometry';

// Hand-picked, unrelated to the box's own size — the point of the feature.
const ARROW_LENGTH_MPC = 42;

// world-space axis directions before F2's rotated basis lands.
const UNIT_AXES: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// centerMpc=[1,2,3], sizeMpc=[8,8,8] ⇒ halfExtentMpc=[4,4,4].
const BOX: GridBox = {
  centerMpc: [1, 2, 3],
  sizeMpc: [8, 8, 8],
  dims: [8, 8, 8],
  voxelSizeMpc: 1,
};

describe('gizmoHandleGeometry', () => {
  it('places each translate arrow at center + axisDir·arrowLengthMpc', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);

    expect(geometry.translate[0].positionMpc).toEqual([1 + 42, 2, 3]);
    expect(geometry.translate[1].positionMpc).toEqual([1, 2 + 42, 3]);
    expect(geometry.translate[2].positionMpc).toEqual([1, 2, 3 + 42]);
    expect(geometry.translate[0].id).toEqual({ kind: 'translate', axis: 0 });
  });

  it('leaves translate tip placement UNCHANGED when the box size doubles — the point of the feature', () => {
    const doubledBox: GridBox = { ...BOX, sizeMpc: [16, 16, 16] };
    const geometry = gizmoHandleGeometry(doubledBox, UNIT_AXES, ARROW_LENGTH_MPC);

    // Same arrowLengthMpc, same tip — only halfExtentMpc (and so resize/rotate) moved.
    expect(geometry.translate[0].positionMpc).toEqual([1 + 42, 2, 3]);
  });

  it('places each resize handle at its face center (center ± half-extent along its axis)', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    const plusX = geometry.resize.find(
      (h) => h.id.kind === 'resize' && h.id.axis === 0 && h.id.sign === 1,
    );
    const minusY = geometry.resize.find(
      (h) => h.id.kind === 'resize' && h.id.axis === 1 && h.id.sign === -1,
    );

    // +x face: center[0] + half[0] = 1 + 4 = 5.
    expect(plusX?.positionMpc).toEqual([5, 2, 3]);
    // -y face: center[1] - half[1] = 2 - 4 = -2.
    expect(minusY?.positionMpc).toEqual([1, -2, 3]);
  });

  it('gives every rotate handle a radiusMpc-0 F1 stub, centered on the box', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES, ARROW_LENGTH_MPC);
    for (const ring of geometry.rotate) {
      expect(ring.radiusMpc).toBe(0);
      expect(ring.centerMpc).toEqual(BOX.centerMpc);
    }
  });
});
