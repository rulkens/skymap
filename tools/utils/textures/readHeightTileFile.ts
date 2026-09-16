import { existsSync, readFileSync } from 'node:fs';

import sharp from 'sharp';

import type { HeightTile } from '../../../src/@types/scene/HeightTile';
import { HEIGHT_TILE_CHUNK_FOURCC } from '../../../src/data/scene/heightTileFormat';
import { readRiffChunk } from '../../../src/utils/image/readRiffChunk';
import { decodeHeightTile } from '../../../src/utils/scene/decodeHeightTile';

/**
 * readHeightTileFile — a tool-side read-back of a baked height tile, or null
 * if the file is absent (a normal sparse-pyramid miss). A file that EXISTS but
 * has lost its `SHGT` chunk throws instead of returning null: unlike a
 * runtime 404, that means the bake wrote a broken file.
 */
export async function readHeightTileFile(path: string): Promise<HeightTile | null> {
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  const chunk = readRiffChunk(bytes, HEIGHT_TILE_CHUNK_FOURCC);
  if (chunk === null) {
    throw new Error(`readHeightTileFile: ${path} has no ${HEIGHT_TILE_CHUNK_FOURCC} chunk`);
  }
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  return decodeHeightTile(
    { data, width: info.width, height: info.height, channels: info.channels as 3 | 4 },
    chunk,
  );
}
