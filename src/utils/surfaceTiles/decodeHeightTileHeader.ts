import type { HeightTileHeader } from '../../@types/scene/HeightTileHeader';
import {
  HEIGHT_GRID_BYTES,
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_CHUNK_BYTES,
  HEIGHT_TILE_GRID_OFFSET,
  HEIGHT_TILE_POSTS_OFFSET,
  HEIGHT_TILE_RESIDUAL_OFFSET,
  HEIGHT_TILE_SUBTREE_MAX_OFFSET,
  HEIGHT_TILE_SUBTREE_MIN_OFFSET,
  HEIGHT_TILE_VERSION,
  HEIGHT_TILE_VERSION_BYTES,
  HEIGHT_TILE_VERSION_OFFSET,
} from '../../data/scene/heightTileFormat';

/** decodeHeightTileHeader — a height tile's `SHGT` chunk payload to its header. */
export function decodeHeightTileHeader(chunk: Uint8Array): HeightTileHeader {
  if (chunk.length < HEIGHT_TILE_VERSION_OFFSET + HEIGHT_TILE_VERSION_BYTES) {
    throw new Error(
      `decodeHeightTileHeader: header chunk is ${chunk.length} bytes, need ${HEIGHT_TILE_CHUNK_BYTES}`,
    );
  }
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  // Version before size: a v2 chunk is 16 bytes where v3 needs 883, so a size-first
  // check would blame a truncated download for what is really a stale cached tile.
  const version = view.getUint16(HEIGHT_TILE_VERSION_OFFSET, true);
  if (version !== HEIGHT_TILE_VERSION) {
    throw new Error(
      `decodeHeightTileHeader: unsupported version ${version} — regenerate via "npm run build-surface-tiles"`,
    );
  }
  if (chunk.length < HEIGHT_TILE_CHUNK_BYTES) {
    throw new Error(
      `decodeHeightTileHeader: header chunk is ${chunk.length} bytes, need ${HEIGHT_TILE_CHUNK_BYTES}`,
    );
  }
  const posts = view.getUint16(HEIGHT_TILE_POSTS_OFFSET, true);
  if (posts !== HEIGHT_POSTS_PER_TILE) {
    throw new Error(
      `decodeHeightTileHeader: ${posts} posts per edge, expected ${HEIGHT_POSTS_PER_TILE}`,
    );
  }
  return {
    subtreeMinM: view.getFloat32(HEIGHT_TILE_SUBTREE_MIN_OFFSET, true),
    subtreeMaxM: view.getFloat32(HEIGHT_TILE_SUBTREE_MAX_OFFSET, true),
    geometricResidualM: view.getFloat32(HEIGHT_TILE_RESIDUAL_OFFSET, true),
    // A copy, not a view: the chunk is a subarray of the whole downloaded file, and a
    // view would pin that 8.7 KB WebP for as long as the tile stays resident.
    gridCodes: chunk.slice(HEIGHT_TILE_GRID_OFFSET, HEIGHT_TILE_GRID_OFFSET + HEIGHT_GRID_BYTES),
  };
}
