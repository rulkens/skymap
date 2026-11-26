import { readFileSync, statSync } from 'node:fs';

import sharp from 'sharp';

import type { HorizonTile } from '../@types/HorizonTile';

/** readHorizonTileFile — a baked horizon tile back from disk: a zero-byte file is flat, anything
 *  else the 258 × 258 RGBA raster; null when the file is absent. */
export async function readHorizonTileFile(path: string): Promise<HorizonTile | null> {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return null;
  }
  if (size === 0) return { kind: 'flat' };
  const { data } = await sharp(readFileSync(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { kind: 'image', rgba: new Uint8Array(data) };
}
