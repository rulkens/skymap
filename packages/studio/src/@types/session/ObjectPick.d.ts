/** An object picked for a position or selection-ref param: `pickObjectSaga` answers with that param's `paramEdited`. */
import type { RowRef } from '../rows/RowRef';

export type ObjectPick = {
  readonly ref: RowRef;
  readonly param: string;
  /** The field's label, for the Undo entry. */
  readonly label: string;
  readonly focusId: string;
  /** Its position at the preview instant, or its selection ref (a Focus step). */
  readonly stores: 'position' | 'ref';
};
