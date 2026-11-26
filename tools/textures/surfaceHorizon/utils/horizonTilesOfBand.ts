import type { SurfaceTileManifestBand } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifestBand';
import { surfaceTileBandFromBounds } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileBandFromBounds';
import { surfaceTileInBand } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileInBand';
import type { HorizonBakeTask } from '../@types/HorizonBakeTask';
import { HORIZON_SUB_TILE_LEVELS } from '../data/horizonSubTiles';
import { horizonLevelsOfBand } from './horizonLevelsOfBand';

/**
 * horizonTilesOfBand — the horizon tiles a height band yields: the ancestor two levels up of each
 * of its height tiles in `index.txt` (`<prefix>/height/<z>/<x>/<y>.webp`), kept where
 * `surfaceTileInBand` holds over the band's horizon levels (`horizonManifest` writes that band).
 * A requestable tile with no height tile under it is left out: every post would be marched on its
 * ancestor's heights, so the runtime reads the ancestor instead. Sorted by (z, y, x) so
 * neighbouring tasks share decoded height tiles.
 */
export function horizonTilesOfBand(
  indexLines: readonly string[],
  prefix: string,
  band: SurfaceTileManifestBand,
  tilePx: number,
): HorizonBakeTask[] {
  const heightBand = surfaceTileBandFromBounds(band.bounds, band.min, band.max);
  const levels = horizonLevelsOfBand(band);
  const horizonBand = surfaceTileBandFromBounds(band.bounds, levels.min, levels.max);
  const heightPrefix = `${prefix}/height/`;
  const tasks = new Map<string, HorizonBakeTask>();
  for (const line of indexLines) {
    if (!line.startsWith(heightPrefix)) continue;
    const [zText, xText, yFile] = line.slice(heightPrefix.length).split('/');
    const [hz, hx, hy] = [Number(zText), Number(xText), Number.parseInt(yFile!, 10)];
    if (!surfaceTileInBand([heightBand], tilePx, hz, hx, hy)) continue;
    const task = {
      z: hz - HORIZON_SUB_TILE_LEVELS,
      x: hx >> HORIZON_SUB_TILE_LEVELS,
      y: hy >> HORIZON_SUB_TILE_LEVELS,
    };
    if (surfaceTileInBand([horizonBand], tilePx, task.z, task.x, task.y)) {
      tasks.set(`${task.z}/${task.x}/${task.y}`, task);
    }
  }
  return [...tasks.values()].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}
