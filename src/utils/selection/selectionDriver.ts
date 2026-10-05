import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { DriverGeometry } from '../../@types/engine/camera/DriverGeometry';

/**
 * Non-driving arms of `SelectionRow` carry no `driver` field at all (rather
 * than a `null` one), so `in` is the discriminant the camera readers need.
 */
export function selectionDriver(row: SelectionRow | null): DriverGeometry | null {
  return row !== null && 'driver' in row ? row.driver : null;
}
