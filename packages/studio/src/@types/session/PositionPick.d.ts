/** An object picked for a position param: `pickPositionSaga` answers with that param's `paramEdited`. */
import type { RowRef } from '../rows/RowRef';

export type PositionPick = {
  readonly ref: RowRef;
  readonly param: string;
  /** The field's label, for the Undo entry. */
  readonly label: string;
  readonly focusId: string;
};
