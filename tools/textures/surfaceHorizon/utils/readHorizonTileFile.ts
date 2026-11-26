import { readFileSync, statSync } from 'node:fs';

import sharp from 'sharp';

import { HORIZON_TILE_PX } from '../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';
import type { HorizonTile } from '../@types/HorizonTile';

/** readHorizonTileFile — a baked horizon tile back from disk: a zero-byte file is flat, anything
 *  else the 258 × 258 RGBA raster; null when the file is absent. Any other size (an older bake
 *  left on disk) throws: the globe repack would stride it into garbled rows. */
export async function readHorizonTileFile(path: string): Promise<HorizonTile | null> {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return null;
  }
  if (size === 0) return { kind: 'flat' };
  const { data, info } = await sharp(readFileSync(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== HORIZON_TILE_PX || info.height !== HORIZON_TILE_PX) {
    throw new Error(
      `readHorizonTileFile: ${path} is ${info.width} × ${info.height}, not ${HORIZON_TILE_PX}; clear the horizon folder and re-bake`,
    );
  }
  return { kind: 'image', rgba: new Uint8Array(data) };
}
