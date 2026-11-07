import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';
import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import type { RecedingFocusRow } from '../../@types/engine/selection/RecedingFocusRow';
import type { FocusSubject } from '../../@types/engine/subsystems/FocusSubject';

/**
 * The focus ramp's subject: the focused ref, when its row declares a receding focus. The row is
 * saga-reconciled and can trail a new ref for a frame, so a row of another kind is no subject.
 */
export function focusSubjectOf(
  ref: SelectionRefBase | null,
  row: SelectionRowBase | null,
): FocusSubject | null {
  if (ref === null || row === null || row.type !== ref.type || !('focusSphere' in row)) return null;
  return { ref, sphere: (row as RecedingFocusRow).focusSphere };
}
