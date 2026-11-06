import type { DriverGeometry } from '../../@types/engine/camera/DriverGeometry';
import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import type { DrivenSelectionRow } from '../../@types/engine/DrivenSelectionRow';

/**
 * Non-driving rows carry no `driver` field at all (rather
 * than a `null` one), so `in` is the discriminant the camera readers need.
 */
export function selectionDriver(row: SelectionRowBase | null): DriverGeometry | null {
  return row !== null && 'driver' in row ? (row as DrivenSelectionRow).driver : null;
}
