import sharp from 'sharp';

import type { HeightTile } from '../../../src/@types/scene/HeightTile';
import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_CHUNK_BYTES,
  HEIGHT_TILE_CHUNK_FOURCC,
  HEIGHT_TILE_POST_COUNT,
  HEIGHT_TILE_POSTS_OFFSET,
  HEIGHT_TILE_RESIDUAL_OFFSET,
  HEIGHT_TILE_SUBTREE_MAX_OFFSET,
  HEIGHT_TILE_SUBTREE_MIN_OFFSET,
  HEIGHT_TILE_VERSION,
  HEIGHT_TILE_VERSION_OFFSET,
} from '../../../src/data/scene/heightTileFormat';
import { codeHeightM } from '../../../src/utils/scene/codeHeightM';
import { heightCode } from '../../../src/utils/scene/heightCode';
import { appendWebpChunk } from '../image/appendWebpChunk';

const RGB_CHANNELS = 3;

/**
 * encodeHeightTile — one tile as a lossless Terrain-RGB WebP with its `SHGT`
 * header chunk. Refuses off-grid posts rather than rounding them: the header
 * bounds were derived from the posts, so rounding here would make the file
 * disagree with its own header (the bake quantises first, via quantizeHeightGrid).
 */
export async function encodeHeightTile(tile: HeightTile): Promise<Uint8Array> {
  if (tile.heightM.length !== HEIGHT_TILE_POST_COUNT) {
    throw new Error(
      `encodeHeightTile: ${tile.heightM.length} posts, expected ${HEIGHT_TILE_POST_COUNT}`,
    );
  }
  const rgb = new Uint8Array(HEIGHT_TILE_POST_COUNT * RGB_CHANNELS);
  for (let i = 0; i < HEIGHT_TILE_POST_COUNT; i++) {
    const v = tile.heightM[i]!;
    const code = heightCode(v);
    if (codeHeightM(code) !== v) {
      throw new Error(`encodeHeightTile: post ${i} (${v} m) is off the height-code grid`);
    }
    rgb[i * RGB_CHANNELS] = code >>> 16;
    rgb[i * RGB_CHANNELS + 1] = (code >>> 8) & 0xff;
    rgb[i * RGB_CHANNELS + 2] = code & 0xff;
  }

  const webp = await sharp(rgb, {
    raw: { width: HEIGHT_POSTS_PER_TILE, height: HEIGHT_POSTS_PER_TILE, channels: RGB_CHANNELS },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();

  const chunk = new Uint8Array(HEIGHT_TILE_CHUNK_BYTES);
  const view = new DataView(chunk.buffer);
  view.setUint16(HEIGHT_TILE_VERSION_OFFSET, HEIGHT_TILE_VERSION, true);
  view.setUint16(HEIGHT_TILE_POSTS_OFFSET, HEIGHT_POSTS_PER_TILE, true);
  view.setFloat32(HEIGHT_TILE_SUBTREE_MIN_OFFSET, tile.subtreeMinM, true);
  view.setFloat32(HEIGHT_TILE_SUBTREE_MAX_OFFSET, tile.subtreeMaxM, true);
  view.setFloat32(HEIGHT_TILE_RESIDUAL_OFFSET, tile.geometricResidualM, true);

  return appendWebpChunk(
    new Uint8Array(webp.buffer, webp.byteOffset, webp.byteLength),
    HEIGHT_POSTS_PER_TILE,
    HEIGHT_POSTS_PER_TILE,
    HEIGHT_TILE_CHUNK_FOURCC,
    chunk,
  );
}
