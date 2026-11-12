import type { SelectionSlot } from '../engine/SelectionSlot';
import type { SelectionAnchor } from '../engine/selection/SelectionAnchor';
import type { SelectionRowBase } from '../engine/selection/SelectionRowBase';

/**
 * SelectionRowsState — the saga-owned derived cache of `SelectionState`: per
 * slot, the resolved row (the UI's read surface) and its durable id paired with
 * the ref it was encoded from. Only `watchSelectionRowsSaga` writes it.
 *
 * An id outlives its row while the ref is unchanged (a released source), so the
 * re-anchor can find the thing again; readers that publish it gate on the row.
 */
export type SelectionRowsState = {
  readonly [K in SelectionSlot]: SelectionRowBase | null;
} & { readonly ids: Readonly<Record<SelectionSlot, SelectionAnchor | null>> };
