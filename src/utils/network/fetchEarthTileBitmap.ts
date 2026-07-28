import type { EarthTileId } from '../../@types/data/EarthTileId';
import { earthTilePath } from '../scene/earthTilePath';
import { dataUrl } from '../../services/loading/fetchWithProgress';

/**
 * A `fetch()` promise that never settles leaks more than a socket: the tile
 * `PriorityQueue` marks the key in-flight until its fetcher settles, and the
 * render-on-demand loop treats an in-flight fetch as "keep ticking". A stalled
 * tile would therefore pin one of four pipes AND spin the loop forever. Ten
 * seconds is generous for a ~33 KB static object off a CDN — the goal is
 * "eventually settles", not "fast".
 */
const FETCH_DEADLINE_MS = 10_000;

/**
 * fetchEarthTileBitmap — one virtual-texture tile, decoded ready for atlas
 * upload, or `null` if it is not there.
 *
 * ## A 404 is the normal case, not an error
 *
 * Both candidate imagery sources are land-oriented, so most of the grid does not
 * exist and the planner has no coverage index to consult. That is deliberate
 * (spec design 8): the client requests, a miss returns `null`, the stream
 * subsystem memoises the key as failed and never asks again. One cheap request
 * per absent tile per session buys us out of shipping a coverage bitmap that
 * would have to be kept in sync with the bake. So this function returning `null`
 * carries no diagnostic weight and logs nothing.
 *
 * ## Decode options, and why they are not the galaxy thumbnail's
 *
 * No `resizeWidth` / `resizeHeight`: the tile is already exactly the atlas slot
 * edge, because both come from the same manifest `tilePx`. Resizing here would
 * silently paper over a bake/atlas mismatch that should instead be visible.
 *
 * `premultiplyAlpha: 'none'` because alpha is the land mask, not coverage
 * (design 5): the fragment multiplies it into the blend weight itself, so
 * premultiplied RGB would darken every coastal pixel toward black before the
 * base ever got a say.
 *
 * The colour-space conversion is left at the browser's default, which is what
 * pairs with the `rgba8unorm-srgb` atlas: the hardware de-gammas on read exactly
 * as the whole-globe surface texture does today. (If Q1 lands on tiling the
 * NORMAL map too, that kind needs `colorSpaceConversion: 'none'` and a LINEAR
 * atlas — packed numeric channels must never be de-gammaed — and
 * `isLinearTextureKind` is already the single home for that axis.)
 */
export async function fetchEarthTileBitmap(tile: EarthTileId): Promise<ImageBitmap | null> {
  const url = dataUrl(`images/${earthTilePath(tile)}`);
  try {
    const res = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
    });
    if (!res.ok) return null;
    // A throttled or misconfigured origin answers with an HTML error page, and
    // `createImageBitmap` throws on that rather than returning null. Checking the
    // type first keeps the failure on the quiet `null` path.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    return await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none' });
  } catch {
    return null;
  }
}
