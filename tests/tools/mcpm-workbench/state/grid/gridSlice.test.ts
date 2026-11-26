/**
 * gridSlice — every user-facing grid-control setter must clear `importedBox`
 * back to null: a preset reloads to a bit-identical box only
 * until the user starts steering the grid controls again, at which point
 * the override has to die so deriveGridBox goes back to computing from
 * voxel size/manual bounds. `fitBoxToCatalog` ("auto fit") counts as one
 * of these edits too — it writes manualCenterMpc/manualSizeMpc directly,
 * same as a hand-dragged slider.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { GridBox } from '../../../../../tools/mcpm-workbench/@types/grid/GridBox';
import type { GridSlice } from '../../../../../tools/mcpm-workbench/@types/grid/GridSlice';
import type { SimLaneCounts } from '../../../../../tools/mcpm-workbench/@types/sim/SimLaneCounts';
import { deriveGridBox } from '../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { estimateBoxGpuBytes } from '../../../../../tools/mcpm-workbench/src/sim/memory/estimateBoxGpuBytes';
import { GPU_BUFFER_ZONE_FROM } from '../../../../../tools/mcpm-workbench/src/sim/memory/gpuBufferZoneFrom.constant';
import {
  defaultGridSlice,
  gridSlice,
} from '../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { voxelSizeSliderFor } from '../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/voxelSizeSliderFor';

const { actions, reducer } = gridSlice;
const LANES: SimLaneCounts = { agentCount: 1_000_000, pointCount: 1_000_000 };
const fit = (bounds: { min: Vec3; max: Vec3 }) => actions.fitBoxToCatalog({ bounds, lanes: LANES });

// centerMpc/sizeMpc/rotation deliberately differ from defaultGridSlice's manual
// values on every axis — an installImportedBox test asserting sync against
// a fixture that coincides with the defaults can't distinguish "synced"
// from "left untouched" (see task-S17-review.md; rotation follows the same
// reasoning for F2.5's manualRotation sync).
const IMPORTED_BOX: GridBox = {
  centerMpc: [10, -5, 3],
  sizeMpc: [300, 300, 300],
  dims: [256, 256, 256],
  voxelSizeMpc: 1.171875,
  rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], // 90° about Y — non-identity
};

const withImportedBox = { ...defaultGridSlice, importedBox: IMPORTED_BOX };

describe('gridSlice setters clear importedBox on any user edit', () => {
  it('fitBoxToCatalog clears it', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    expect(reducer(withImportedBox, fit(bounds)).importedBox).toBeNull();
  });

  it('setAutoFitPercent clears it', () => {
    expect(reducer(withImportedBox, actions.setAutoFitPercent(90)).importedBox).toBeNull();
  });
});

describe('setAutoFitPercent', () => {
  it('clamps below 80 up to 80', () => {
    expect(reducer(defaultGridSlice, actions.setAutoFitPercent(50)).autoFitPercent).toBe(80);
  });
});

describe('installImportedBox', () => {
  it('syncs manualCenterMpc/manualSizeMpc/manualRotation/manualVoxelSizeMpc to the imported box while installing it (S17, F2.5, V1)', () => {
    const next = reducer(defaultGridSlice, actions.installImportedBox(IMPORTED_BOX));
    expect(next.importedBox).toEqual(IMPORTED_BOX);
    expect(next.manualCenterMpc).toEqual(IMPORTED_BOX.centerMpc);
    expect(next.manualSizeMpc).toEqual(IMPORTED_BOX.sizeMpc);
    expect(next.manualRotation).toEqual(IMPORTED_BOX.rotation);
    expect(next.manualVoxelSizeMpc).toEqual(IMPORTED_BOX.voxelSizeMpc);
  });

  it('a subsequent setManualSizeMpc still clears importedBox (V3 ruling stays green)', () => {
    const loaded = reducer(defaultGridSlice, actions.installImportedBox(IMPORTED_BOX));
    expect(reducer(loaded, actions.setManualSizeMpc([50, 50, 50])).importedBox).toBeNull();
  });

  it('a subsequent resize/translate drag on a loaded rotated box keeps its rotation (no snap to identity)', () => {
    // F2.5 regression: manualRotation must be synced at install time, not left at the
    // default identity — otherwise clearing importedBox (any manual edit, V3) would fall
    // onto deriveGridBox's manual path and silently reset a loaded box's orientation.
    const loaded = reducer(defaultGridSlice, actions.installImportedBox(IMPORTED_BOX));
    const afterDrag = reducer(loaded, actions.setManualCenterMpc([20, 20, 20]));
    expect(afterDrag.importedBox).toBeNull();
    expect(afterDrag.manualRotation).toEqual(IMPORTED_BOX.rotation);
  });
});

describe('setMaxBufferBytes', () => {
  it('records the device limit without clearing importedBox — a hardware fact, not a user edit', () => {
    const next = reducer(withImportedBox, actions.setMaxBufferBytes(4 * 1024 ** 3));
    expect(next.maxBufferBytes).toBe(4 * 1024 ** 3);
    expect(next.importedBox).toEqual(IMPORTED_BOX);
  });
});

describe('fitBoxToCatalog', () => {
  it('centers on the bounds midpoint and pads the extent by 2x paddingMpc per axis', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    const next = reducer({ ...defaultGridSlice, paddingMpc: 5 }, fit(bounds));
    expect(next.manualCenterMpc).toEqual([50, 25, 15]);
    expect(next.manualSizeMpc).toEqual([110, 60, 40]);
  });

  it('bakes paddingMpc in at click time — a later paddingMpc change does not retroactively resize', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    const fitted = reducer({ ...defaultGridSlice, paddingMpc: 5 }, fit(bounds));
    const afterPaddingEdit = reducer(fitted, actions.setPaddingMpc(50));
    expect(afterPaddingEdit.manualSizeMpc).toEqual(fitted.manualSizeMpc);
  });
});

describe('fitBoxToCatalog on a known device limit', () => {
  const booted = {
    ...defaultGridSlice,
    maxBufferBytes: 4 * 1024 ** 3,
    resolvedElement: 'f16' as const,
  };
  const giant: { min: Vec3; max: Vec3 } = {
    min: [-8_000, -8_000, -8_000],
    max: [8_000, 8_000, 8_000],
  };
  const barFraction = (grid: GridSlice) =>
    estimateBoxGpuBytes(grid, LANES.agentCount, LANES.pointCount) / grid.maxBufferBytes!;

  it('raises the voxel size until a Milliquas-sized sim sits below the GPU bar warn zone', () => {
    const fitted = reducer(booted, fit(giant));
    expect(fitted.manualVoxelSizeMpc).toBeGreaterThan(booted.manualVoxelSizeMpc);
    expect(barFraction(fitted)).toBeLessThan(GPU_BUFFER_ZONE_FROM.warn);
    const slider = voxelSizeSliderFor(fitted);
    expect(slider.min).toBeLessThanOrEqual(Math.log10(fitted.manualVoxelSizeMpc));
    expect(Math.log10(fitted.manualVoxelSizeMpc)).toBeLessThanOrEqual(slider.max);
  });

  it('keeps the voxel size when the fitted box already fits', () => {
    const small: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    expect(reducer(booted, fit(small)).manualVoxelSizeMpc).toBe(0.75);
  });

  it('raises a voxel size lowered after a fit again on the next fit, and only then', () => {
    const fitted = reducer(booted, fit(giant));
    const lowered = reducer(fitted, actions.setVoxelSizeMpc(fitted.manualVoxelSizeMpc / 2));
    const refitted = reducer(lowered, fit(giant));
    expect(refitted.manualVoxelSizeMpc).toBeCloseTo(fitted.manualVoxelSizeMpc, 9);
    const coarser = reducer(fitted, actions.setVoxelSizeMpc(fitted.manualVoxelSizeMpc * 2));
    expect(reducer(coarser, fit(giant)).manualVoxelSizeMpc).toBe(coarser.manualVoxelSizeMpc);
  });
});

describe('setPaddingMpc', () => {
  it('refuses an empty or negative padding, so auto fit never builds a NaN or negative box', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [-50, -50, -50], max: [50, 50, 50] };
    for (const padding of [NaN, -60, Infinity]) {
      const edited = reducer(defaultGridSlice, actions.setPaddingMpc(padding));
      expect(edited.paddingMpc).toBe(defaultGridSlice.paddingMpc);
      const { dims } = deriveGridBox(reducer(edited, fit(bounds)));
      for (const d of dims) {
        expect(d).toBeGreaterThan(0);
        expect(d % 8).toBe(0);
      }
    }
  });

  it('takes a padding of 0', () => {
    expect(reducer(defaultGridSlice, actions.setPaddingMpc(0)).paddingMpc).toBe(0);
  });
});
