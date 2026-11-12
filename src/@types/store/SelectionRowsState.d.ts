import type { SelectionSlot } from '../engine/SelectionSlot';
import type { SelectionRefBase } from '../engine/selection/SelectionRefBase';
import type { SelectionRowBase } from '../engine/selection/SelectionRowBase';

/**
 * SelectionRowsState — the saga-owned derived cache of `SelectionState`: per
 * slot, the resolved row (the UI's read surface), its durable id and the ref
 * both were extracted from. Only `watchSelectionRowsSaga` writes it.
 *
 * An id outlives its row while the ref is unchanged (a released source), so the
 * re-anchor can find the thing again; readers that publish it gate on the row.
 */
export type SelectionRowsState = {
  readonly [K in SelectionSlot]: SelectionRowBase | null;
} & {
  readonly ids: Readonly<Record<SelectionSlot, string | null>>;
  readonly extractedFrom: Readonly<Record<SelectionSlot, SelectionRefBase | null>>;
};
