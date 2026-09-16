import type { HeightTile } from '../../@types/scene/HeightTile';
import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_CHUNK_BYTES,
  HEIGHT_TILE_POST_COUNT,
  HEIGHT_TILE_POSTS_OFFSET,
  HEIGHT_TILE_RESIDUAL_OFFSET,
  HEIGHT_TILE_SUBTREE_MAX_OFFSET,
  HEIGHT_TILE_SUBTREE_MIN_OFFSET,
  HEIGHT_TILE_VERSION,
  HEIGHT_TILE_VERSION_OFFSET,
} from '../../data/scene/heightTileFormat';
import { codeHeightM } from './codeHeightM';

type DecodedPixels = {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels: 3 | 4;
};

/**
 * decodeHeightTile — decoded Terrain-RGB pixels plus the `SHGT` chunk to posts.
 * Pure, so the browser (canvas RGBA) and the tools (sharp RGB) share it; alpha
 * is never read. Every code maps to a finite height, so no NaN check is needed.
 */
export function decodeHeightTile(pixels: DecodedPixels, chunk: Uint8Array): HeightTile {
  if (chunk.length < HEIGHT_TILE_CHUNK_BYTES) {
    throw new Error(
      `decodeHeightTile: header chunk is ${chunk.length} bytes, need ${HEIGHT_TILE_CHUNK_BYTES}`,
    );
  }
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const version = view.getUint16(HEIGHT_TILE_VERSION_OFFSET, true);
  if (version !== HEIGHT_TILE_VERSION) {
    throw new Error(
      `decodeHeightTile: unsupported version ${version} — regenerate via "npm run build-surface-tiles"`,
    );
  }
  const posts = view.getUint16(HEIGHT_TILE_POSTS_OFFSET, true);
  if (posts !== HEIGHT_POSTS_PER_TILE) {
    throw new Error(`decodeHeightTile: ${posts} posts per edge, expected ${HEIGHT_POSTS_PER_TILE}`);
  }
  if (pixels.width !== HEIGHT_POSTS_PER_TILE || pixels.height !== HEIGHT_POSTS_PER_TILE) {
    throw new Error(
      `decodeHeightTile: ${pixels.width}x${pixels.height} image, expected ${HEIGHT_POSTS_PER_TILE}²`,
    );
  }

  const { data, channels } = pixels;
  const heightM = new Float32Array(HEIGHT_TILE_POST_COUNT);
  for (let i = 0; i < HEIGHT_TILE_POST_COUNT; i++) {
    const p = i * channels;
    heightM[i] = codeHeightM(data[p]! * 65536 + data[p + 1]! * 256 + data[p + 2]!);
  }

  return {
    subtreeMinM: view.getFloat32(HEIGHT_TILE_SUBTREE_MIN_OFFSET, true),
    subtreeMaxM: view.getFloat32(HEIGHT_TILE_SUBTREE_MAX_OFFSET, true),
    geometricResidualM: view.getFloat32(HEIGHT_TILE_RESIDUAL_OFFSET, true),
    heightM,
  };
}
