import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GridBox } from './GridBox';
import type { GridBudget } from './GridBudget';
import type { GridElement } from './GridElement';

/**
 * GridSlice — the grid-box CONFIG (what the panel edits) plus the last
 * RESOLVED box (what the sim actually runs on). `box`/`resolvedElement`/
 * `byteBudget` are null until the first successful build — the panel can be
 * open before any catalog has loaded. Manual mode takes center + size +
 * a long-axis resolution, never free dims (`autoFitGridBox`'s own contract);
 * one `divisor` derives that resolution for BOTH auto-fit and manual — one
 * resolution lever, not two (see `deriveGridBox`).
 *
 * `importedBox` is V3's load-side override: `deriveGridBox` returns it
 * VERBATIM when set, so a loaded preset reloads to a bit-identical box
 * regardless of autoFit/divisor/manual bounds. Every setter below that
 * represents a user editing the grid controls clears it back to null — the
 * override exists only until the user starts steering again.
 */
export type GridSlice = {
  readonly autoFit: boolean;
  readonly divisor: number;
  readonly paddingMpc: number;
  readonly manualCenterMpc: Vec3;
  readonly manualSizeMpc: Vec3;
  readonly importedBox: GridBox | null;
  readonly box: GridBox | null;
  readonly resolvedElement: GridElement | null;
  readonly byteBudget: GridBudget | null;
};
