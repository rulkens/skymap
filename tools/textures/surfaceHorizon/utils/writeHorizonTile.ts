import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import sharp from 'sharp';

import { HORIZON_POSTS_PER_TILE } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import type { HorizonTile } from '../@types/HorizonTile';

const SIDE = 2 * HORIZON_POSTS_PER_TILE;

/** writeHorizonTile — a flat tile as a zero-byte file, an image as lossless WebP, atomically
 *  (a killed bake must not leave a torn file the resume skip trusts). `exact` keeps RGB under
 *  alpha 0: channel A carries sectors 3, 7, 11 and 15, and a lit sector is byte 0. */
export async function writeHorizonTile(outPath: string, tile: HorizonTile): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  if (tile.kind === 'flat') writeFileSync(tmpPath, new Uint8Array(0));
  else {
    await sharp(tile.rgba, { raw: { width: SIDE, height: SIDE, channels: 4 } })
      .webp({ lossless: true, exact: true })
      .toFile(tmpPath);
  }
  renameSync(tmpPath, outPath);
}
