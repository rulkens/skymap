import type { HeightTileImage } from '../../@types/scene/HeightTileImage';
import type { SurfaceTileId } from '../../@types/data/SurfaceTileId';
import { HEIGHT_POSTS_PER_TILE, HEIGHT_TILE_CHUNK_FOURCC } from '../../data/scene/heightTileFormat';
import { readRiffChunk } from '../image/readRiffChunk';
import { decodeHeightTileHeader } from '../scene/decodeHeightTileHeader';
import { surfaceTilePath } from '../scene/surfaceTilePath';
import { dataUrl } from '../../services/loading/fetchWithProgress';

// An in-flight fetch pins a queue pipe and keeps the render-on-demand loop
// ticking, so a promise that never settles leaks more than a socket.
const FETCH_DEADLINE_MS = 10_000;

/**
 * fetchHeightTile — one Terrain-RGB WebP height tile as header + still-encoded
 * bitmap, or `null` if absent (404s are normal; so is a missing `SHGT` chunk or
 * failed decode, e.g. an HTML error page). Pixels are never read back on the
 * CPU: Brave, Safari and Firefox perturb canvas readback, so the shader decodes.
 */
export async function fetchHeightTile(
  tile: SurfaceTileId,
  prefix: string,
): Promise<HeightTileImage | null> {
  const url = dataUrl(`images/${surfaceTilePath(tile, prefix)}`);
  try {
    const res = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
    });
    if (!res.ok) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
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
