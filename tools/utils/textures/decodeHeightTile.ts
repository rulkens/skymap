import type { DecodedPixels } from '../../textures/DecodedPixels';
import type { HeightTile } from '../../textures/HeightTile';
import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_POST_COUNT,
} from '../../../src/data/scene/heightTileFormat';
import { codeHeightM } from './codeHeightM';
import { decodeHeightTileHeader } from '../../../src/utils/surfaceTiles/decodeHeightTileHeader';

const RGB_CHANNELS = 3;

/**
 * decodeHeightTile — decoded Terrain-RGB pixels plus the `SHGT` chunk to posts,
 * for the tools (the runtime decodes on the GPU instead); pixels are packed RGB.
 * Every code maps to a finite height, so a length check is the only guard
 * against NaN posts.
 */
export function decodeHeightTile(pixels: DecodedPixels, chunk: Uint8Array): HeightTile {
  const header = decodeHeightTileHeader(chunk);
  if (pixels.width !== HEIGHT_POSTS_PER_TILE || pixels.height !== HEIGHT_POSTS_PER_TILE) {
    throw new Error(
      `decodeHeightTile: ${pixels.width}x${pixels.height} image, expected ${HEIGHT_POSTS_PER_TILE}²`,
    );
  }

  const { data } = pixels;
  // A short buffer (or one with alpha) would misread posts, or read NaN.
  if (data.length !== HEIGHT_TILE_POST_COUNT * RGB_CHANNELS) {
    throw new Error(
      `decodeHeightTile: ${data.length} pixel bytes, expected ${HEIGHT_TILE_POST_COUNT * RGB_CHANNELS}`,
    );
  }
  const heightM = new Float32Array(HEIGHT_TILE_POST_COUNT);
  for (let i = 0; i < HEIGHT_TILE_POST_COUNT; i++) {
    const p = i * RGB_CHANNELS;
    heightM[i] = codeHeightM(data[p]! * 65536 + data[p + 1]! * 256 + data[p + 2]!);
  }

  return { ...header, heightM };
}
