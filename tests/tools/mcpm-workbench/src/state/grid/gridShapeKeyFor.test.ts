/**
 * gridShapeKeyFor — same rotation-must-participate contract as
 * `state/scene/watchSceneSaga.test.ts`'s exhaustive trigger fixture, for the pending-box
 * PREVIEW timer instead of the rebuild trigger: a rotate drag that ends with the
 * pointer off the canvas must still restart the 200ms preview flash, or the gizmo disappears
 * the instant the drag ends.
 */
import { describe, expect, it } from 'vitest';
import type { Vec4 } from '../../../../../../packages/shared/src/@types/math/Vec4';
import { defaultAppState } from '../../../../../../tools/mcpm-workbench/src/store/defaultAppState';
import { gridShapeKeyFor } from '../../../../../../tools/mcpm-workbench/src/state/grid/gridShapeKeyFor';

describe('gridShapeKeyFor', () => {
  it('differs when only grid.manualRotation changes', () => {
    const before = gridShapeKeyFor(defaultAppState);
    const rotation: Vec4 = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    const rotated = {
      ...defaultAppState,
      grid: { ...defaultAppState.grid, manualRotation: rotation },
    };

    expect(JSON.stringify(gridShapeKeyFor(rotated))).not.toBe(JSON.stringify(before));
  });

  // manualVoxelSizeMpc is one of the five shape fields —
  // a missed one means a resolution edit stops restarting the preview timer.
  it('differs when only grid.manualVoxelSizeMpc changes', () => {
    const before = gridShapeKeyFor(defaultAppState);
    const resized = {
      ...defaultAppState,
      grid: {
        ...defaultAppState.grid,
        manualVoxelSizeMpc: defaultAppState.grid.manualVoxelSizeMpc + 1,
      },
    };

    expect(JSON.stringify(gridShapeKeyFor(resized))).not.toBe(JSON.stringify(before));
  });
});
