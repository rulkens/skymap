import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import {
  applyResizeDrag,
  MIN_SIZE_MPC,
} from '../../../../tools/mcpm-workbench/src/gizmo/applyResizeDrag';

// centerMpc=[1,2,3], sizeMpc=[8,8,8] ⇒ halfExtentMpc=[4,4,4] — same fixture as
// gizmoHandleGeometry.test.ts.
const BOX: GridBox = {
  centerMpc: [1, 2, 3],
  sizeMpc: [8, 8, 8],
  dims: [8, 8, 8],
  voxelSizeMpc: 1,
};

describe('applyResizeDrag', () => {
  it('grows sizeMpc on the dragged axis and anchors the opposite face (sign = 1)', () => {
    // sign=1, axis=1 (y), deltaMpc=5: size.y += 5 = 13, center.y += 5/2 = 4.5.
    const result = applyResizeDrag(BOX, 1, [0, 1, 0], 1, 5);
    expect(result.sizeMpc).toEqual([8, 13, 8]);
    expect(result.centerMpc).toEqual([1, 4.5, 3]);

    // Un-dragged face is center - half (sign=1's opposite): 2 - 4 = -2 before,
    // newCenter.y - newHalf.y = 4.5 - 6.5 = -2 after.
    const faceBefore = BOX.centerMpc[1] - BOX.sizeMpc[1] / 2;
    const faceAfter = result.centerMpc[1] - result.sizeMpc[1] / 2;
    expect(faceAfter).toBeCloseTo(faceBefore, 10);
  });

  it('grows sizeMpc on the dragged axis and anchors the opposite face (sign = -1)', () => {
    // sign=-1, axis=1 (y), deltaMpc=-5 (handle dragged further in -axisDir, away from
    // center): size.y += (-1)*(-5) = 13. The anchor is the OPPOSITE (sign=-1's is +y)
    // face, which a naive `center.y += sign*deltaMpc/2` (= 4.5, sign=1's own answer)
    // would NOT keep fixed — see applyResizeDrag.ts's doc comment.
    const result = applyResizeDrag(BOX, 1, [0, 1, 0], -1, -5);
    expect(result.sizeMpc).toEqual([8, 13, 8]);
    expect(result.centerMpc).toEqual([1, -0.5, 3]);

    // Un-dragged face is center + half (sign=-1's opposite): 2 + 4 = 6 before,
    // newCenter.y + newHalf.y = -0.5 + 6.5 = 6 after.
    const faceBefore = BOX.centerMpc[1] + BOX.sizeMpc[1] / 2;
    const faceAfter = result.centerMpc[1] + result.sizeMpc[1] / 2;
    expect(faceAfter).toBeCloseTo(faceBefore, 10);
  });

  it('floors at MIN_SIZE_MPC, keeping the anchored face fixed', () => {
    // sign=1, axis=0 (x), a deltaMpc large and negative enough to invert the
    // unfloored box (half 4 -> -46) clamps to MIN_SIZE_MPC/2 instead.
    const result = applyResizeDrag(BOX, 0, [1, 0, 0], 1, -100);
    expect(result.sizeMpc[0]).toBe(MIN_SIZE_MPC);
    expect(result.centerMpc).toEqual([-2.5, 2, 3]);

    // Anchored (-x) face: 1 - 4 = -3 before, -2.5 - 0.5 = -3 after — fixed even
    // though the floor overrode the unfloored formula.
    const faceBefore = BOX.centerMpc[0] - BOX.sizeMpc[0] / 2;
    const faceAfter = result.centerMpc[0] - result.sizeMpc[0] / 2;
    expect(faceAfter).toBeCloseTo(faceBefore, 10);
  });
});
