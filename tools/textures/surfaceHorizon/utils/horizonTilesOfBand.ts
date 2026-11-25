import type { SurfaceTileManifestBand } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifestBand';
import { surfaceTileBandFromBounds } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileBandFromBounds';
import { surfaceTileInBand } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileInBand';
import type { HorizonBakeTask } from '../@types/HorizonBakeTask';

/**
 * horizonTilesOfBand — the tiles a band's horizon covers: its height tiles, by the same
 * `surfaceTileInBand` predicate the runtime gates requests on, read off `index.txt`'s height
 * lines (`<prefix>/height/<z>/<x>/<y>.webp`). Sorted by (z, y, x) so neighbouring tasks share
 * decoded height tiles.
 */
export function horizonTilesOfBand(
  indexLines: readonly string[],
  prefix: string,
  band: SurfaceTileManifestBand,
  tilePx: number,
): HorizonBakeTask[] {
  const uvBand = surfaceTileBandFromBounds(band.bounds, band.min, band.max);
  const heightPrefix = `${prefix}/height/`;
  const tasks: HorizonBakeTask[] = [];
  for (const line of indexLines) {
    if (!line.startsWith(heightPrefix)) continue;
    const [z, x, yFile] = line.slice(heightPrefix.length).split('/');
    const task = { z: Number(z), x: Number(x), y: Number.parseInt(yFile!, 10) };
    if (surfaceTileInBand([uvBand], tilePx, task.z, task.x, task.y)) tasks.push(task);
  }
  return tasks.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}
