/**
 * extendCellsSeaward — each cell grown `km` out over the sea along its coast
 * (mapshaper -buffer topological: only unshared edges grow, never over land),
 * neighbouring growths split between them, then merged into their cell. The
 * plate masks fills by its own land row, so a fill must reach past every coast
 * that row may draw; the land borders keep their vertices exactly. Returns the
 * grown cells' topology; two cells now meet across any strait narrower than
 * 2 × km.
 */

import mapshaper from 'mapshaper';

import type { CellTopology } from '../@types/CellTopology';
import type { RealmCell } from '../@types/RealmCell';
import { cellsToGeoJson } from './cellsToGeoJson';
import { topoJsonToCellTopology } from './topoJsonToCellTopology';

export async function extendCellsSeaward(
  cells: readonly RealmCell[],
  km: number,
): Promise<CellTopology> {
  const out = await mapshaper.applyCommands(
    `-i cells.json name=land -buffer topological radius=${km}km target=land + name=sea ` +
      '-merge-layers target=land,sea name=grown force -clean -dissolve key ' +
      '-o topology.json format=topojson no-quantization',
    { 'cells.json': cellsToGeoJson(cells) },
  );
  return topoJsonToCellTopology(String(out['topology.json']));
}
