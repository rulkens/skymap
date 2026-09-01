/**
 * watchSceneSaga structural-trigger coverage — replaces the guarantee the old
 * value-diffing `buildKey` gave for free (react to ANY dispatch that moves a
 * structural field, regardless of which action caused it) with an exhaustive
 * fixture over the action list instead: `GRID_FIXTURES`/`SIM_FIXTURES` are
 * typed as `{ [K in keyof typeof slice.actions]: … }`, so TypeScript itself
 * fails to compile this file the moment a new grid/sim action is added
 * without a fixture entry here. For every fixture, trigger-list membership
 * must agree with "does this action actually move a structural field" in
 * BOTH directions — a structural action missing from the list silently stops
 * rebuilding; a non-structural action wrongly listed tears down a running
 * sim (and its GPU buffers) for nothing, every time it fires.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '@reduxjs/toolkit';
import type { GridBox } from '../../../../../tools/mcpm-workbench/@types/GridBox';
import type { GridBudget } from '../../../../../tools/mcpm-workbench/@types/GridBudget';
import { gridShapeOf } from '../../../../../tools/mcpm-workbench/src/state/gridShapeOf';
import {
  catalogLoaded,
  setWeightMode,
} from '../../../../../tools/mcpm-workbench/src/state/catalog/catalogSlice';
import {
  defaultGridSlice,
  gridSlice,
} from '../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import {
  defaultSimSlice,
  simSlice,
} from '../../../../../tools/mcpm-workbench/src/state/sim/simSlice';
import { SCENE_REBUILD_TRIGGERS } from '../../../../../tools/mcpm-workbench/src/state/scene/watchSceneSaga';

const TRIGGER_TYPES: Set<string> = new Set(SCENE_REBUILD_TRIGGERS.map((action) => action.type));

const SAMPLE_BOX: GridBox = {
  centerMpc: [10, -5, 3],
  sizeMpc: [300, 300, 300],
  dims: [256, 256, 256],
  voxelSizeMpc: 1.171875,
  rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
};
const SAMPLE_BUDGET: GridBudget = {
  perBufferBytes: { depositA: 1, depositB: 1, trace: 1, agents: 1 },
  totalBytes: 4,
  refusal: null,
};

// One fixture per grid action — the mapped type is the exhaustiveness check:
// add a case reducer to gridSlice without adding a row here and this object
// literal fails to typecheck.
const GRID_FIXTURES: {
  [K in keyof typeof gridSlice.actions]: ReturnType<(typeof gridSlice.actions)[K]>;
} = {
  setVoxelSizeMpc: gridSlice.actions.setVoxelSizeMpc(1.5),
  setPaddingMpc: gridSlice.actions.setPaddingMpc(10),
  setManualCenterMpc: gridSlice.actions.setManualCenterMpc([1, 2, 3]),
  setManualSizeMpc: gridSlice.actions.setManualSizeMpc([10, 20, 30]),
  setRotation: gridSlice.actions.setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2]),
  installImportedBox: gridSlice.actions.installImportedBox(SAMPLE_BOX),
  fitBoxToCatalog: gridSlice.actions.fitBoxToCatalog({ min: [0, 0, 0], max: [10, 10, 10] }),
  setShowGridBox: gridSlice.actions.setShowGridBox(true),
  setAutoFitPercent: gridSlice.actions.setAutoFitPercent(90),
  setResolvedGrid: gridSlice.actions.setResolvedGrid({
    resolvedElement: 'f32',
    byteBudget: SAMPLE_BUDGET,
  }),
  setMaxBufferBytes: gridSlice.actions.setMaxBufferBytes(123),
};

function isGridStructural(next: typeof defaultGridSlice): boolean {
  return (
    JSON.stringify(gridShapeOf(next)) !== JSON.stringify(gridShapeOf(defaultGridSlice)) ||
    next.importedBox !== defaultGridSlice.importedBox
  );
}

describe('grid-slice actions vs SCENE_REBUILD_TRIGGERS', () => {
  for (const action of Object.values(GRID_FIXTURES) as Action[]) {
    it(`${action.type}: trigger membership matches whether it moves gridShapeOf/importedBox`, () => {
      const next = gridSlice.reducer(defaultGridSlice, action);
      expect(TRIGGER_TYPES.has(action.type)).toBe(isGridStructural(next));
    });
  }
});

const SIM_FIXTURES: {
  [K in keyof typeof simSlice.actions]: ReturnType<(typeof simSlice.actions)[K]>;
} = {
  setSimParam: simSlice.actions.setSimParam({ key: 'senseSpreadDeg', value: 99 }),
  setAgentCount: simSlice.actions.setAgentCount(2_000_000),
  setInitMode: simSlice.actions.setInitMode('uniform'),
  setRunning: simSlice.actions.setRunning(false),
  setSeed: simSlice.actions.setSeed(2),
  resetStepCount: simSlice.actions.resetStepCount(),
  incrementStep: simSlice.actions.incrementStep(),
};

// createMcpmHarness's own three build-time inputs from SimSlice — the sim fields
// buildKey used to serialize, now hand-checked the same way gridShapeOf is above.
function simStructuralFieldsOf(sim: typeof defaultSimSlice) {
  return { agentCount: sim.agentCount, initMode: sim.initMode, seed: sim.seed };
}

function isSimStructural(next: typeof defaultSimSlice): boolean {
  return (
    JSON.stringify(simStructuralFieldsOf(next)) !==
    JSON.stringify(simStructuralFieldsOf(defaultSimSlice))
  );
}

describe('sim-slice actions vs SCENE_REBUILD_TRIGGERS', () => {
  for (const action of Object.values(SIM_FIXTURES) as Action[]) {
    it(`${action.type}: trigger membership matches whether it moves agentCount/initMode/seed`, () => {
      const next = simSlice.reducer(defaultSimSlice, action);
      expect(TRIGGER_TYPES.has(action.type)).toBe(isSimStructural(next));
    });
  }
});

/**
 * The two catalog-slice triggers don't fit the structural-field-diff pattern above
 * (`catalogLoaded` isn't a value-diff trigger at all — see `watchSceneSaga.ts`'s own
 * docblock; `setWeightMode` moves `catalog.weightMode`, a field neither `gridShapeOf`
 * nor `isSimStructural` touches), so this is a plain membership check instead: without
 * it, removing either from `SCENE_REBUILD_TRIGGERS` passes every OTHER test in this
 * file yet silently stops a catalog load or a weight-mode change from ever rebuilding.
 */
describe('catalog-slice triggers are present in SCENE_REBUILD_TRIGGERS', () => {
  for (const actionCreator of [catalogLoaded, setWeightMode]) {
    it(`${actionCreator.type} is a trigger`, () => {
      expect(TRIGGER_TYPES.has(actionCreator.type)).toBe(true);
    });
  }
});
