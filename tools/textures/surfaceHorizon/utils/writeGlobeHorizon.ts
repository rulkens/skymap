import { existsSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import type { SurfaceTileBodyId } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileBodyId';
import { bodyTextureFilename } from '../../../../src/utils/bodyTextures/bodyTextureFilename';
import type { HorizonTile } from '../@types/HorizonTile';
import { HORIZON_GLOBE_LEVELS } from '../data/horizonGlobeLevels';
import { surfaceTilePath } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTilePath';
import { readHorizonTileFile } from './readHorizonTileFile';
import { repackGlobeHorizon } from './repackGlobeHorizon';

/**
 * writeGlobeHorizon — the whole-globe horizon images, one per tier whose source level is fully
 * baked (a partial level would bake holes into the globe as "lit"); returns the files written.
 * The name carries the tier's nominal px while the image is half that wide (see README).
 */
export async function writeGlobeHorizon(
  imagesDir: string,
  prefix: string,
  bodyId: SurfaceTileBodyId,
): Promise<string[]> {
  const written: string[] = [];
  for (const { tier, level } of HORIZON_GLOBE_LEVELS) {
    const columns = 2 ** level;
    const paths = new Map<string, string>();
    for (let y = 0; y < columns / 2; y++) {
      for (let x = 0; x < columns; x++) {
        paths.set(
          `${x}/${y}`,
          join(imagesDir, surfaceTilePath({ product: 'horizon', z: level, x, y }, prefix)),
        );
      }
    }
    if (![...paths.values()].every((path) => existsSync(path))) {
      process.stderr.write(
        `  globe ${tier} skipped: z${level} is not fully baked (an older image stays on disk)\n`,
      );
      continue;
    }
    const tiles = new Map<string, HorizonTile | null>();
    for (const [key, path] of paths) tiles.set(key, await readHorizonTileFile(path));
    const { width, height, rgba } = repackGlobeHorizon(
      (_z, x, y) => tiles.get(`${x}/${y}`) ?? null,
      level,
    );
    const outPath = join(imagesDir, 'textures', bodyTextureFilename(bodyId, 'horizon', tier));
    await sharp(rgba, { raw: { width, height, channels: 4 } })
      .webp({ lossless: true, exact: true })
      .toFile(outPath);
    written.push(outPath);
  }
  return written;
}
