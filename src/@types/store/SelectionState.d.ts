import type { SelectionRef } from '../engine/SelectionRef';

/**
 * SelectionState — the three identity-Intent slots. Hover precedes select
 * precedes focus; each holds a SelectionRef or null. This is the durable,
 * persistable/restorable Intent layer (sibling to the volatile SelectionRowsState).
 */
export type SelectionState = {
  readonly hover: SelectionRef | null;
  readonly select: SelectionRef | null;
  readonly focus: SelectionRef | null;
};
