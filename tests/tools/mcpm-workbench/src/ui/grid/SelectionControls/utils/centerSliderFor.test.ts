/**
 * centerSliderFor — a centre slider's range always holds the centre, and spans
 * the loaded catalog, so a box fitted far from the origin can still be nudged.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../../../../packages/shared/src/@types/math/Vec3';
import type { GridSlice } from '../../../../../../../../tools/mcpm-workbench/@types/grid/GridSlice';
import { defaultGridSlice } from '../../../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { centerSliderFor } from '../../../../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/centerSliderFor';

const AXES = [0, 1, 2] as const;

describe('centerSliderFor', () => {
  it('keeps the usual ±500 Mpc range for a centre near the origin', () => {
    for (const axis of AXES) {
      expect(centerSliderFor(defaultGridSlice, null, axis)).toEqual({
        value: 0,
        min: -500,
        max: 500,
        step: 1,
      });
    }
  });

  it('holds a far centre inside its range, on the whole-Mpc lattice', () => {
    const grid: GridSlice = { ...defaultGridSlice, manualCenterMpc: [3_210.6, -7_000.2, 499.5] };
    for (const axis of AXES) {
      const slider = centerSliderFor(grid, null, axis);
      expect(slider.min).toBeLessThanOrEqual(slider.value);
      expect(slider.value).toBeLessThanOrEqual(slider.max);
      expect(Number.isInteger(slider.min) && Number.isInteger(slider.max)).toBe(true);
    }
  });

  it('spans the catalog, so a drag over it does not rescale the slider under the pointer', () => {
    const catalog = { min: [-8_000, -2_000, -100] as Vec3, max: [6_000, 7_500, 100] as Vec3 };
    const atCatalogCentre: GridSlice = { ...defaultGridSlice, manualCenterMpc: [-1_000, 2_750, 0] };
    const elsewhere: GridSlice = { ...defaultGridSlice, manualCenterMpc: [4_000, -1_500, 50] };
    for (const axis of AXES) {
      const a = centerSliderFor(atCatalogCentre, catalog, axis);
      const b = centerSliderFor(elsewhere, catalog, axis);
      expect([a.min, a.max]).toEqual([b.min, b.max]);
    }
    expect(centerSliderFor(atCatalogCentre, catalog, 0).max).toBe(8_000);
    expect(centerSliderFor(atCatalogCentre, catalog, 2).max).toBe(500);
  });
});
