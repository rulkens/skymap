import type { HeightTile } from '../../@types/scene/HeightTile';
import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_BYTES,
  HEIGHT_TILE_HEADER_BYTES,
  HEIGHT_TILE_MAGIC,
  HEIGHT_TILE_MAGIC_OFFSET,
  HEIGHT_TILE_POST_COUNT,
  HEIGHT_TILE_POSTS_X_OFFSET,
  HEIGHT_TILE_POSTS_Y_OFFSET,
  HEIGHT_TILE_RESIDUAL_OFFSET,
  HEIGHT_TILE_SUBTREE_MAX_OFFSET,
  HEIGHT_TILE_SUBTREE_MIN_OFFSET,
  HEIGHT_TILE_VERSION,
  HEIGHT_TILE_VERSION_OFFSET,
} from '../../data/scene/heightTileFormat';

/**
 * decodeHeightTile — `shgt1` bytes to posts, rejecting anything the GPU must
 * never see. A NaN post propagates into vertex positions and a `−9999`
 * sentinel arrives as a 10 km pit, so every post is checked once here rather
 * than guarded at each of displacement's read sites.
 *
 * A payload landing on a 4-aligned offset is viewed in place; otherwise it is
 * copied, because alignment is the caller's slicing choice and not a defect in
 * the bytes — throwing would report a good tile as corrupt.
 */
export function decodeHeightTile(buf: ArrayBuffer, byteOffset = 0): HeightTile {
  if (buf.byteLength - byteOffset < HEIGHT_TILE_BYTES) {
    throw new Error(
      `decodeHeightTile: need ${HEIGHT_TILE_BYTES} bytes, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset, HEIGHT_TILE_BYTES);

  const magic = view.getUint32(HEIGHT_TILE_MAGIC_OFFSET, true);
  if (magic !== HEIGHT_TILE_MAGIC) {
    throw new Error(`decodeHeightTile: bad magic 0x${magic.toString(16)}, expected shgt1`);
  }
  const version = view.getUint16(HEIGHT_TILE_VERSION_OFFSET, true);
  if (version !== HEIGHT_TILE_VERSION) {
    throw new Error(
      `decodeHeightTile: unsupported version ${version} — regenerate via "npm run build-surface-tiles"`,
    );
  }
  const postsX = view.getUint16(HEIGHT_TILE_POSTS_X_OFFSET, true);
  const postsY = view.getUint16(HEIGHT_TILE_POSTS_Y_OFFSET, true);
  if (postsX !== HEIGHT_POSTS_PER_TILE || postsY !== HEIGHT_POSTS_PER_TILE) {
    throw new Error(
      `decodeHeightTile: ${postsX}x${postsY} posts, expected ${HEIGHT_POSTS_PER_TILE}²`,
    );
  }

  const payloadOffset = byteOffset + HEIGHT_TILE_HEADER_BYTES;
  const heightM =
    payloadOffset % 4 === 0
      ? new Float32Array(buf, payloadOffset, HEIGHT_TILE_POST_COUNT)
      : new Float32Array(buf.slice(payloadOffset, payloadOffset + HEIGHT_TILE_POST_COUNT * 4));

  for (let i = 0; i < heightM.length; i++) {
    if (!Number.isFinite(heightM[i])) {
      throw new Error(`decodeHeightTile: non-finite post at index ${i} (${heightM[i]})`);
    }
  }

  return {
    subtreeMinM: view.getFloat32(HEIGHT_TILE_SUBTREE_MIN_OFFSET, true),
    subtreeMaxM: view.getFloat32(HEIGHT_TILE_SUBTREE_MAX_OFFSET, true),
    geometricResidualM: view.getFloat32(HEIGHT_TILE_RESIDUAL_OFFSET, true),
    heightM,
  };
}
