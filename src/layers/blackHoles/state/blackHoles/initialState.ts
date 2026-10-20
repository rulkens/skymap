import { BLACK_HOLE_SOURCE_ROWS } from '../../sources/blackHoleSourceRows';
import type { BlackHolesSettings } from '../../../../@types/settings/BlackHolesSettings';

// Derived from the registry rows so the record is complete for every hole:
// the reducer writes a field into an existing item and never creates one.
export const initialState: BlackHolesSettings = {
  items: Object.fromEntries(
    BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => [entry.id, { labelEnabled: true }]),
  ) as BlackHolesSettings['items'],
};
