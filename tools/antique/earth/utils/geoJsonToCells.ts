/** geoJsonToCells — mapshaper's GeoJSON output back as realm cells; features it emptied are dropped
 * (an empty layer comes out as a bare GeometryCollection, no features at all). */

import type { LonLatPolygons } from '../@types/LonLatPolygons';
import type { RealmCell } from '../@types/RealmCell';

export function geoJsonToCells(text: string): RealmCell[] {
  const { features = [] } = JSON.parse(text) as {
    features?: {
      properties: { key: string };
      geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null;
    }[];
  };
  return features.flatMap(({ properties, geometry }) => {
    if (!geometry) return [];
    const polygons = (
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    ) as LonLatPolygons;
    return polygons.length > 0 ? [{ key: String(properties.key), polygons }] : [];
  });
}
