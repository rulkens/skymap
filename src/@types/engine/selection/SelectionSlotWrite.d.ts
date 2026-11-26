import type { SelectionSlot } from '../SelectionSlot';
import type { SelectionRefBase } from './SelectionRefBase';

/** A ref write for one selection slot; `null` clears it. */
export type SelectionSlotWrite = {
  readonly slot: SelectionSlot;
  readonly ref: SelectionRefBase | null;
};
