import type { HeightTile } from '../../@types/scene/HeightTile';
import type { SurfaceTileId } from '../../@types/data/SurfaceTileId';
import { HEIGHT_TILE_CHUNK_FOURCC } from '../../data/scene/heightTileFormat';
import { readRiffChunk } from '../image/readRiffChunk';
import { decodeHeightTile } from '../scene/decodeHeightTile';
import { surfaceTilePath } from '../scene/surfaceTilePath';
import { dataUrl } from '../../services/loading/fetchWithProgress';

// An in-flight fetch pins a queue pipe and keeps the render-on-demand loop
// ticking, so a promise that never settles leaks more than a socket.
const FETCH_DEADLINE_MS = 10_000;

/**
 * fetchHeightTile — one Terrain-RGB WebP height tile, decoded ready for atlas
 * upload, or `null` if absent. A 404 is normal (the height pyramid is as
 * sparse as the albedo one), and so is a missing `SHGT` chunk or a failed
 * image decode — an HTML error page from a throttled origin fails both — all
 * degrading to `null` rather than an exception that would take the frame down.
 */
export async function fetchHeightTile(
  tile: SurfaceTileId,
  prefix: string,
): Promise<HeightTile | null> {
  const url = dataUrl(`images/${surfaceTilePath(tile, prefix)}`);
  let bitmap: ImageBitmap | null = null;
  try {
    const res = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
    });
    if (!res.ok) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    const chunk = readRiffChunk(bytes, HEIGHT_TILE_CHUNK_FOURCC);
    if (chunk === null) return null;

    bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    // Sized from the bitmap, not the format, so `decodeHeightTile`'s dimension
    // check sees a wrong-sized image instead of a zero-padded 129² readback.
    const { width, height } = bitmap;
    const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
    if (ctx === null) return null;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    return decodeHeightTile({ data, width, height, channels: 4 }, chunk);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
