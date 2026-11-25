/**
 * A Milliquas-sized catalog (quasars out to several Gpc) auto-fitted on a real
 * device limit: the voxel floor lands above the usual 4 Mpc top end, and every
 * Selection slider must still hold its value and let the grid be coarsened.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import { snapToStep } from '../../../../../../src/utils/math/snapToStep';
import type { GridSlice } from '../../../../../../tools/mcpm-workbench/@types/grid/GridSlice';
import { deriveGridBox } from '../../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { voxelSizeFloorMpc } from '../../../../../../tools/mcpm-workbench/src/grid/voxelSize/voxelSizeFloorMpc';
import { estimateBoxGpuBytes } from '../../../../../../tools/mcpm-workbench/src/sim/memory/estimateBoxGpuBytes';
import { planGridBudget } from '../../../../../../tools/mcpm-workbench/src/sim/memory/planGridBudget';
import {
  defaultGridSlice,
  fitBoxToCatalog,
  gridSlice,
  setVoxelSizeMpc,
} from '../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { AGENT_COUNT_MIN } from '../../../../../../tools/mcpm-workbench/src/state/sim/simSlice';
import { centerSliderFor } from '../../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/centerSliderFor';
import { sizeSliderFor } from '../../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/sizeSliderFor';
import { voxelSizeSliderFor } from '../../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/voxelSizeSliderFor';

const AXES = [0, 1, 2] as const;
const DEVICE_LIMIT_BYTES = 4 * 1024 ** 3;
const POINT_COUNT = 1_000_000;
const REACH_MPC = 8_000;
const catalogBoundsMpc = {
  min: [-REACH_MPC, -REACH_MPC, -REACH_MPC] as Vec3,
  max: [REACH_MPC, REACH_MPC, REACH_MPC] as Vec3,
};

function autoFitted(): GridSlice {
  const booted: GridSlice = {
    ...defaultGridSlice,
    maxBufferBytes: DEVICE_LIMIT_BYTES,
    resolvedElement: 'f16',
  };
  return gridSlice.reducer(
    booted,
    fitBoxToCatalog({
      bounds: catalogBoundsMpc,
      lanes: { agentCount: AGENT_COUNT_MIN, pointCount: POINT_COUNT },
    }),
  );
}

describe('Selection sliders for a ±8,000 Mpc catalog', () => {
  it('auto fits a box the device builds, above the usual voxel-size top end', () => {
    const grid = autoFitted();
    expect(voxelSizeFloorMpc(grid)!).toBeGreaterThan(4);
    const budget = planGridBudget(deriveGridBox(grid), POINT_COUNT + AGENT_COUNT_MIN, 'f16', {
      maxBufferSize: DEVICE_LIMIT_BYTES,
      maxStorageBufferBindingSize: DEVICE_LIMIT_BYTES,
    });
    expect(budget.refusal).toBeNull();
  });

  it('holds every slider value inside its range', () => {
    const grid = autoFitted();
    const box = deriveGridBox(grid);
    const sliders = [
      voxelSizeSliderFor(grid),
      ...AXES.map((axis) => sizeSliderFor(box, axis)),
      ...AXES.map((axis) => centerSliderFor(grid, catalogBoundsMpc, axis)),
    ];
    for (const { value, min, max } of sliders) {
      expect(min).toBeLessThanOrEqual(value);
      expect(value).toBeLessThanOrEqual(max);
    }
  });

  it('raises the voxel size by one key press, which lowers the GPU memory', () => {
    const grid = autoFitted();
    const { value, min, max, step } = voxelSizeSliderFor(grid);
    const raised = snapToStep(value + step, min, max, step);
    expect(raised).toBeGreaterThan(value);
    const coarser = gridSlice.reducer(grid, setVoxelSizeMpc(10 ** raised));
    expect(deriveGridBox(coarser).voxelSizeMpc).toBeGreaterThan(deriveGridBox(grid).voxelSizeMpc);
    expect(estimateBoxGpuBytes(coarser, AGENT_COUNT_MIN, POINT_COUNT)).toBeLessThan(
      estimateBoxGpuBytes(grid, AGENT_COUNT_MIN, POINT_COUNT),
    );
  });
});
