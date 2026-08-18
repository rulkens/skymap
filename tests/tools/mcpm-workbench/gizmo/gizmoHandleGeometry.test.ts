import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import {
  ARROW_REACH_FRACTION,
  gizmoHandleGeometry,
} from '../../../../tools/mcpm-workbench/src/gizmo/gizmoHandleGeometry';

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
  it('places each translate arrow at ARROW_REACH_FRACTION of the half-extent along its axis', () => {
    // ARROW_REACH_FRACTION(0.6) * half(4) = 2.4, added to center on that axis only.
    expect(ARROW_REACH_FRACTION).toBe(0.6);
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES);

    expect(geometry.translate[0].positionMpc).toEqual([1 + 2.4, 2, 3]);
    expect(geometry.translate[1].positionMpc).toEqual([1, 2 + 2.4, 3]);
    expect(geometry.translate[2].positionMpc).toEqual([1, 2, 3 + 2.4]);
    expect(geometry.translate[0].id).toEqual({ kind: 'translate', axis: 0 });
  });

  it('places each resize handle at its face center (center ± half-extent along its axis)', () => {
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES);
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
    const geometry = gizmoHandleGeometry(BOX, UNIT_AXES);
    for (const ring of geometry.rotate) {
      expect(ring.radiusMpc).toBe(0);
      expect(ring.centerMpc).toEqual(BOX.centerMpc);
    }
  });
});
