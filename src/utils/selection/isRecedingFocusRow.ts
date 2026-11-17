import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import type { RecedingFocusRow } from '../../@types/engine/selection/RecedingFocusRow';

/** Whether a selection row's focus recedes the rest of the scene. */
export function isRecedingFocusRow(row: SelectionRowBase | null): row is RecedingFocusRow {
  return row !== null && 'focusRegion' in row;
}
