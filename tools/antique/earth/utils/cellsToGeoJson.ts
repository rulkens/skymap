/** cellsToGeoJson — realm cells as a GeoJSON FeatureCollection keyed by `key`, mapshaper's input form. */

import type { RealmCell } from '../@types/RealmCell';

export function cellsToGeoJson(cells: readonly RealmCell[]): unknown {
  return {
    type: 'FeatureCollection',
    features: cells.map((cell) => ({
      type: 'Feature',
      properties: { key: cell.key },
      geometry: { type: 'MultiPolygon', coordinates: cell.polygons },
    })),
  };
}
