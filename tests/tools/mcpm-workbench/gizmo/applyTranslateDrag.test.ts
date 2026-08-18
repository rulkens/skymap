import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import { applyTranslateDrag } from '../../../../tools/mcpm-workbench/src/gizmo/applyTranslateDrag';

// centerMpc=[1,2,3], sizeMpc=[8,8,8] — same fixture shape as gizmoHandleGeometry.test.ts.
const BOX: GridBox = {
  centerMpc: [1, 2, 3],
  sizeMpc: [8, 8, 8],
  dims: [8, 8, 8],
  voxelSizeMpc: 1,
  rotation: [0, 0, 0, 1],
};

describe('applyTranslateDrag', () => {
  it('moves centerMpc by deltaMpc along axisDir', () => {
    // axisDir=[0,1,0], deltaMpc=5 ⇒ only the y component shifts, by exactly 5.
    const result = applyTranslateDrag(BOX, [0, 1, 0], 5);
    expect(result).toEqual([1, 7, 3]);
  });

  it('scales the shift by axisDir components on a non-axis-aligned direction', () => {
    // A unit diagonal direction spreads deltaMpc across all three components equally.
    const d = 1 / Math.sqrt(3);
    const result = applyTranslateDrag(BOX, [d, d, d], 6);
    expect(result[0]).toBeCloseTo(1 + 6 * d, 10);
    expect(result[1]).toBeCloseTo(2 + 6 * d, 10);
    expect(result[2]).toBeCloseTo(3 + 6 * d, 10);
  });
});
