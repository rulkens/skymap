import type { SelectionSlot } from '../engine/SelectionSlot';
import type { SelectionRefBase } from '../engine/selection/SelectionRefBase';
import type { SelectionRowBase } from '../engine/selection/SelectionRowBase';

/** One slot's extraction: the row and durable id the reconciler took from `ref`. */
export type SetSelectionRowPayload = {
  readonly slot: SelectionSlot;
  readonly row: SelectionRowBase | null;
  readonly id: string | null;
  readonly ref: SelectionRefBase | null;
};
