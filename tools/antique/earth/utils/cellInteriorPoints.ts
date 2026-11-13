/**
 * cellInteriorPoints — one label point per key, inside the largest part of the
 * key's cells (mapshaper -points inner: the visual centre, never off the land
 * the way a centroid falls off a crescent).
 */

import mapshaper from 'mapshaper';

import type { RealmCell } from '../@types/RealmCell';
import { cellsToGeoJson } from './cellsToGeoJson';

export async function cellInteriorPoints(
  cells: readonly RealmCell[],
): Promise<Map<string, readonly [number, number]>> {
  const out = await mapshaper.applyCommands('-i cells.json -dissolve key -points inner -o points.json', {
    'cells.json': cellsToGeoJson(cells),
  });
  const { features = [] } = JSON.parse(String(out['points.json'])) as {
    features?: { properties: { key: string }; geometry: { coordinates: [number, number] } | null }[];
  };
  return new Map(
    features.flatMap((f) => (f.geometry ? [[String(f.properties.key), f.geometry.coordinates] as const] : [])),
  );
}
