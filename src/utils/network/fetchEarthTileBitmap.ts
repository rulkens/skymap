import type { EarthTileId } from '../../@types/data/EarthTileId';
import { earthTilePath } from '../scene/earthTilePath';
import { dataUrl } from '../../services/loading/fetchWithProgress';

// An in-flight fetch pins a queue pipe and keeps the render-on-demand loop
// ticking, so a promise that never settles leaks more than a socket.
const FETCH_DEADLINE_MS = 10_000;

/**
 * fetchEarthTileBitmap — one virtual-texture tile, decoded ready for atlas
 * upload, or `null` if it is not there.
 *
 * A 404 is the normal case, not an error: both imagery sources are
 * land-oriented, so most of the grid doesn't exist. A miss returns `null` and
 * logs nothing; the stream subsystem memoises it as failed.
 *
 * No `resizeWidth`/`resizeHeight`: the tile is already the atlas slot edge
 * (both come from the manifest's `tilePx`).
 *
 * `premultiplyAlpha: 'none'` because alpha is the land mask, not coverage: the
 * fragment multiplies it into the blend weight itself, so premultiplied RGB
 * would darken coastal pixels toward black first.
 */
export async function fetchEarthTileBitmap(
  tile: EarthTileId,
  prefix: string,
): Promise<ImageBitmap | null> {
  const url = dataUrl(`images/${earthTilePath(tile, prefix)}`);
  try {
    const res = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
    });
    if (!res.ok) return null;
    // A throttled origin answers with an HTML error page, and
    // `createImageBitmap` throws on that rather than returning null.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    return await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none' });
  } catch {
    return null;
  }
}
