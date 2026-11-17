/**
 * dissolveCells — the pieces sharing a key merged into one cell each (mapshaper
 * -dissolve), after -clean has removed the overlaps and hairline gaps left
 * where a cut line ran beside, not on, a modern admin edge.
 */

import mapshaper from 'mapshaper';

import type { RealmCell } from '../@types/RealmCell';
import { cellsToGeoJson } from './cellsToGeoJson';
import { geoJsonToCells } from './geoJsonToCells';

export async function dissolveCells(pieces: readonly RealmCell[]): Promise<RealmCell[]> {
  const out = await mapshaper.applyCommands('-i pieces.json -clean -dissolve key -o cells.json', {
    'pieces.json': cellsToGeoJson(pieces),
  });
  return geoJsonToCells(String(out['cells.json']));
}
