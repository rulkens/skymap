/**
 * projectVolumeFieldRows — pure projection from the per-field volume
 * settings Record to the `VolumeFieldRowData[]` the density sections render.
 *
 * Iterates `COSMIC_WEB_DENSITY_SOURCE_ROWS`, not `Object.keys(items)`, so row
 * order is the registry's declared order rather than object key order, and
 * takes `label` from the source row instead of a second registry lookup.
 * `items` is a total Record from boot (`CosmicWebDensitySettings['items']`,
 * seeded by the Layer's `initialState` literal), so no per-field fallback is
 * needed.
 */

import type { VolumeFieldRowData } from '../@types/VolumeFieldRowData';
import type { CosmicWebDensitySettings } from '../@types/CosmicWebDensitySettings';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';

export function projectVolumeFieldRows(
  items: CosmicWebDensitySettings['items'],
): ReadonlyArray<VolumeFieldRowData> {
  return COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => ({
    ...items[entry.id],
    id: entry.id,
    label: entry.label,
  }));
}
