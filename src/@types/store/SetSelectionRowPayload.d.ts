import type { SelectionSlot } from '../engine/SelectionSlot';
import type { SelectionAnchor } from '../engine/selection/SelectionAnchor';
import type { SelectionRowBase } from '../engine/selection/SelectionRowBase';

/** One slot's extraction: the resolved row and the slot's durable id. */
export type SetSelectionRowPayload = {
  readonly slot: SelectionSlot;
  readonly row: SelectionRowBase | null;
  readonly id: SelectionAnchor | null;
};
