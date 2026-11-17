/**
 * assembleOhmRelation — an OpenHistoricalMap boundary relation as polygons:
 * the faces its outer member ways enclose, less the faces its inner ways
 * enclose (mapshaper -polygons builds the faces from the way network, so a
 * ring split over many ways, or two rings touching at a node, still closes).
 * -polygons output has no attribute table: the dissolve takes no field and
 * the key geoJsonToCells reads is put back after.
 */

import mapshaper from 'mapshaper';

import type { LonLatPolygons } from '../@types/LonLatPolygons';
import type { OhmElement } from '../@types/OhmElement';
import { geoJsonToCells } from './geoJsonToCells';

export async function assembleOhmRelation(
  relation: Extract<OhmElement, { type: 'relation' }>,
  ways: ReadonlyMap<number, Extract<OhmElement, { type: 'way' }>>,
): Promise<LonLatPolygons> {
  const lines = (inner: boolean) => ({
    type: 'FeatureCollection',
    features: relation.members
      .filter((m) => m.type === 'way' && (m.role === 'inner') === inner && ways.has(m.ref))
      .map((m) => ({
        type: 'Feature',
        properties: { key: 'r' },
        geometry: {
          type: 'LineString',
          coordinates: ways.get(m.ref)!.geometry.map((p) => [p.lon, p.lat]),
        },
      })),
  });
  const inner = lines(true);
  const out = await mapshaper.applyCommands(
    inner.features.length > 0
      ? '-i combine-files outer.json inner.json -polygons target=outer -polygons target=inner ' +
          '-erase inner target=outer -dissolve target=outer -each "key=\'r\'" target=outer -o target=outer out.json'
      : '-i outer.json -polygons -dissolve -each "key=\'r\'" -o out.json',
    { 'outer.json': lines(false), 'inner.json': inner },
  );
  return geoJsonToCells(String(out['out.json'])).flatMap((cell) => cell.polygons);
}
