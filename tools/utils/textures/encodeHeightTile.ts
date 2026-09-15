import type { HeightTile } from '../../../src/@types/scene/HeightTile';
import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_BYTES,
  HEIGHT_TILE_HEADER_BYTES,
  HEIGHT_TILE_MAGIC,
  HEIGHT_TILE_MAGIC_OFFSET,
  HEIGHT_TILE_POST_COUNT,
  HEIGHT_TILE_POSTS_X_OFFSET,
  HEIGHT_TILE_POSTS_Y_OFFSET,
  HEIGHT_TILE_RESERVED_OFFSET,
  HEIGHT_TILE_RESIDUAL_OFFSET,
  HEIGHT_TILE_SUBTREE_MAX_OFFSET,
  HEIGHT_TILE_SUBTREE_MIN_OFFSET,
  HEIGHT_TILE_VERSION,
  HEIGHT_TILE_VERSION_OFFSET,
} from '../../../src/data/scene/heightTileFormat';

/**
 * encodeHeightTile — one tile's bytes in the `shgt1` layout.
 *
 * Deliberately not lenient about the post count: a short or long payload here
 * would write a file the decoder rejects only once it reaches a browser, hours
 * of bake later. Post FINITENESS is the bake's own assertion (it can name the
 * tile and the lattice point); this only refuses to lie about the header.
 */
export function encodeHeightTile(tile: HeightTile): Uint8Array {
  if (tile.heightM.length !== HEIGHT_TILE_POST_COUNT) {
    throw new Error(
      `encodeHeightTile: ${tile.heightM.length} posts, expected ${HEIGHT_TILE_POST_COUNT}`,
    );
  }
  const bytes = new Uint8Array(HEIGHT_TILE_BYTES);
  const view = new DataView(bytes.buffer);

  view.setUint32(HEIGHT_TILE_MAGIC_OFFSET, HEIGHT_TILE_MAGIC, true);
  view.setUint16(HEIGHT_TILE_VERSION_OFFSET, HEIGHT_TILE_VERSION, true);
  view.setUint16(HEIGHT_TILE_POSTS_X_OFFSET, HEIGHT_POSTS_PER_TILE, true);
  view.setUint16(HEIGHT_TILE_POSTS_Y_OFFSET, HEIGHT_POSTS_PER_TILE, true);
  view.setUint16(HEIGHT_TILE_RESERVED_OFFSET, 0, true);
  view.setFloat32(HEIGHT_TILE_SUBTREE_MIN_OFFSET, tile.subtreeMinM, true);
  view.setFloat32(HEIGHT_TILE_SUBTREE_MAX_OFFSET, tile.subtreeMaxM, true);
  view.setFloat32(HEIGHT_TILE_RESIDUAL_OFFSET, tile.geometricResidualM, true);

  new Float32Array(bytes.buffer, HEIGHT_TILE_HEADER_BYTES, HEIGHT_TILE_POST_COUNT).set(
    tile.heightM,
  );
  return bytes;
}
