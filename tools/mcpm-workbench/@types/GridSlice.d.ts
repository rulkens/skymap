import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GridBox } from './GridBox';
import type { GridBudget } from './GridBudget';
import type { GridElement } from './GridElement';

/**
 * GridSlice — the grid-box CONFIG (what the panel edits) plus the last
 * RESOLVED box (what the sim actually runs on). `box`/`resolvedElement`/
 * `byteBudget` are null until the first successful build — the panel can be
 * open before any catalog has loaded. Manual mode takes center + size +
 * long-axis resolution, never free dims (`autoFitGridBox`'s own contract);
 * `manualResolution` reuses the same "long axis target" meaning as
 * `longAxisTarget` does for auto-fit.
 */
export type GridSlice = {
  readonly autoFit: boolean;
  readonly longAxisTarget: number;
  readonly paddingMpc: number;
  readonly manualCenterMpc: Vec3;
  readonly manualSizeMpc: Vec3;
  readonly manualResolution: number;
  readonly box: GridBox | null;
  readonly resolvedElement: GridElement | null;
  readonly byteBudget: GridBudget | null;
};
