import type { SurfaceTileManifestBand } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifestBand';
import { surfaceTileBandFromBounds } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileBandFromBounds';
import { surfaceTileColumns } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileColumns';
import { surfaceTileInBand } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileInBand';
import type { HorizonBakeTask } from '../@types/HorizonBakeTask';
import { HORIZON_SUB_TILE_LEVELS } from '../data/horizonSubTiles';

/**
 * horizonTilesOfBand — the horizon tiles a height band yields: the ancestor two levels up of each
 * of its height tiles in `index.txt` (`<prefix>/height/<z>/<x>/<y>.webp`), with that ancestor's
 * siblings, kept where `surfaceTileInBand` holds over the band shifted up two levels, the same
 * predicate the runtime requests by (`horizonManifest` writes that shifted band). Sorted by
 * (z, y, x) so neighbouring tasks share decoded height tiles.
 */
export function horizonTilesOfBand(
  indexLines: readonly string[],
  prefix: string,
  band: SurfaceTileManifestBand,
  tilePx: number,
): HorizonBakeTask[] {
  const heightBand = surfaceTileBandFromBounds(band.bounds, band.min, band.max);
  const horizonBand = surfaceTileBandFromBounds(
    band.bounds,
    band.min - HORIZON_SUB_TILE_LEVELS,
    band.max - HORIZON_SUB_TILE_LEVELS,
  );
  const heightPrefix = `${prefix}/height/`;
  const tasks = new Map<string, HorizonBakeTask>();
  for (const line of indexLines) {
    if (!line.startsWith(heightPrefix)) continue;
    const [zText, xText, yFile] = line.slice(heightPrefix.length).split('/');
    const [hz, hx, hy] = [Number(zText), Number(xText), Number.parseInt(yFile!, 10)];
    if (!surfaceTileInBand([heightBand], tilePx, hz, hx, hy)) continue;
    const z = hz - HORIZON_SUB_TILE_LEVELS;
    const x0 = (hx >> HORIZON_SUB_TILE_LEVELS) & ~1;
    const y0 = (hy >> HORIZON_SUB_TILE_LEVELS) & ~1;
    // z1 is a single row: its sibling pair's second row does not exist.
    const rows = surfaceTileColumns(z, tilePx) / 2;
    for (let q = 0; q < 4; q++) {
      const task = { z, x: x0 + (q & 1), y: y0 + (q >> 1) };
      if (task.y < rows && surfaceTileInBand([horizonBand], tilePx, task.z, task.x, task.y)) {
        tasks.set(`${task.z}/${task.x}/${task.y}`, task);
      }
    }
  }
  return [...tasks.values()].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}
