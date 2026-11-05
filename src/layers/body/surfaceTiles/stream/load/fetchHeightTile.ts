import type { HeightTileImage } from '../@types/HeightTileImage';
import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_CHUNK_FOURCC,
} from '../../format/data/heightTileFormat';
import { readRiffChunk } from '../../../../../utils/image/readRiffChunk';
import { decodeHeightTileHeader } from '../../format/utils/decodeHeightTileHeader';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';

/**
 * fetchHeightTile — one Terrain-RGB WebP height tile as header + still-encoded
 * bitmap, or `null` if the source has no such tile or the bytes lack a valid `SHGT`
 * chunk. Pixels are never read back on the
 * CPU: Brave, Safari and Firefox perturb canvas readback, so the shader decodes.
 */
export async function fetchHeightTile(
  tile: SurfaceTileId,
  source: SurfaceTileSource,
): Promise<HeightTileImage | null> {
  try {
    const bytes = await source.readTile(tile);
    if (bytes === null) return null;
    const chunk = readRiffChunk(bytes, HEIGHT_TILE_CHUNK_FOURCC);
    if (chunk === null) return null;
    const header = decodeHeightTileHeader(chunk);

    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    // The atlas copies exactly one slot, so a wrong-sized image would read as
    // a cropped or zero-padded lattice.
    if (bitmap.width !== HEIGHT_POSTS_PER_TILE || bitmap.height !== HEIGHT_POSTS_PER_TILE) {
      bitmap.close();
      return null;
    }
    return { ...header, bitmap };
  } catch {
    return null;
  }
}
