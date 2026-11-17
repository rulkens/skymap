/** readNaturalEarthAdmin1 — the Natural Earth admin-1 GeoJSON as units with their rule codes (`data/raw/naturalearth/README.md`). */

import { readFileSync } from 'node:fs';

import type { AdminUnit } from '../@types/AdminUnit';
import type { LonLatPolygons } from '../@types/LonLatPolygons';

export function readNaturalEarthAdmin1(path: string): AdminUnit[] {
  const { features } = JSON.parse(readFileSync(path, 'utf8')) as {
    features: {
      properties: { iso_3166_2: string | null; adm0_a3: string; geonunit: string | null };
      geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null;
    }[];
  };
  return features.flatMap(({ properties, geometry }) =>
    geometry
      ? [
          {
            iso: properties.iso_3166_2 ?? '',
            adm0: properties.adm0_a3,
            geonunit: properties.geonunit ?? '',
            polygons: (geometry.type === 'Polygon'
              ? [geometry.coordinates]
              : geometry.coordinates) as LonLatPolygons,
          },
        ]
      : [],
  );
}
