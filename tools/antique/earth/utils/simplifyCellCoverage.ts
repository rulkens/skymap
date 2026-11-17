/**
 * simplifyCellCoverage — the cells simplified as one coverage (mapshaper
 * -simplify dp on the sphere): each shared line is simplified once, so both
 * neighbours keep identical vertices, crossings it would introduce are
 * repaired, and no island vanishes. A sliver it collapses leaves its two
 * neighbours with coincident but separate arcs, which would read as coast:
 * -clean rebuilds the topology so they share one. Returns the cells and arcs.
 */

import mapshaper from 'mapshaper';

import type { CellTopology } from '../@types/CellTopology';
import type { RealmCell } from '../@types/RealmCell';
import { cellsToGeoJson } from './cellsToGeoJson';
import { geoJsonToCells } from './geoJsonToCells';
import { topoJsonToCellTopology } from './topoJsonToCellTopology';

export async function simplifyCellCoverage(
  cells: readonly RealmCell[],
  toleranceKm: number,
): Promise<{ cells: RealmCell[]; topology: CellTopology }> {
  const out = await mapshaper.applyCommands(
    `-i cells.json -simplify dp interval=${toleranceKm * 1000}m keep-shapes -clean ` +
      '-o cells.json -o topology.json format=topojson no-quantization',
    { 'cells.json': cellsToGeoJson(cells) },
  );
  return {
    cells: geoJsonToCells(String(out['cells.json'])),
    topology: topoJsonToCellTopology(String(out['topology.json'])),
  };
}
