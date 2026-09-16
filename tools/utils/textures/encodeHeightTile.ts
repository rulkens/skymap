import sharp from 'sharp';

import type { HeightTile } from '../../textures/HeightTile';
import {
  HEIGHT_CODE_BYTES,
  HEIGHT_GRID_POSTS_PER_EDGE,
  HEIGHT_GRID_STRIDE,
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_CHUNK_BYTES,
  HEIGHT_TILE_CHUNK_FOURCC,
  HEIGHT_TILE_GRID_OFFSET,
  HEIGHT_TILE_POST_COUNT,
  HEIGHT_TILE_POSTS_OFFSET,
  HEIGHT_TILE_RESIDUAL_OFFSET,
  HEIGHT_TILE_SUBTREE_MAX_OFFSET,
  HEIGHT_TILE_SUBTREE_MIN_OFFSET,
  HEIGHT_TILE_VERSION,
  HEIGHT_TILE_VERSION_OFFSET,
} from '../../../src/data/scene/heightTileFormat';
import { codeHeightM } from './codeHeightM';
import { heightCode } from './heightCode';
import { appendWebpChunk } from '../image/appendWebpChunk';

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
  const rgb = new Uint8Array(HEIGHT_TILE_POST_COUNT * HEIGHT_CODE_BYTES);
  for (let i = 0; i < HEIGHT_TILE_POST_COUNT; i++) {
    const v = tile.heightM[i]!;
    const code = heightCode(v);
    if (codeHeightM(code) !== v) {
      throw new Error(`encodeHeightTile: post ${i} (${v} m) is off the height-code grid`);
    }
    rgb[i * HEIGHT_CODE_BYTES] = code >>> 16;
    rgb[i * HEIGHT_CODE_BYTES + 1] = (code >>> 8) & 0xff;
    rgb[i * HEIGHT_CODE_BYTES + 2] = code & 0xff;
  }

  const webp = await sharp(rgb, {
    raw: {
      width: HEIGHT_POSTS_PER_TILE,
      height: HEIGHT_POSTS_PER_TILE,
      channels: HEIGHT_CODE_BYTES,
    },
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
  // The CPU grid is a byte-for-byte copy of these very pixels, never a second
  // encoding: that is what makes the camera floor and the drawn surface agree at a
  // shared post by equality rather than by tolerance (§8.4).
  for (let j = 0; j < HEIGHT_GRID_POSTS_PER_EDGE; j++) {
    for (let i = 0; i < HEIGHT_GRID_POSTS_PER_EDGE; i++) {
      const src =
        (j * HEIGHT_GRID_STRIDE * HEIGHT_POSTS_PER_TILE + i * HEIGHT_GRID_STRIDE) *
        HEIGHT_CODE_BYTES;
      const dst =
        HEIGHT_TILE_GRID_OFFSET + (j * HEIGHT_GRID_POSTS_PER_EDGE + i) * HEIGHT_CODE_BYTES;
      chunk.set(rgb.subarray(src, src + HEIGHT_CODE_BYTES), dst);
    }
  }

  return appendWebpChunk(
    new Uint8Array(webp.buffer, webp.byteOffset, webp.byteLength),
    HEIGHT_POSTS_PER_TILE,
    HEIGHT_POSTS_PER_TILE,
    HEIGHT_TILE_CHUNK_FOURCC,
    chunk,
  );
}
