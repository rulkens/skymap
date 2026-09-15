import type { HeightTile } from '../../@types/scene/HeightTile';
import type { SurfaceTileId } from '../../@types/data/SurfaceTileId';
import { decodeHeightTile } from '../scene/decodeHeightTile';
import { surfaceTilePath } from '../scene/surfaceTilePath';
import { dataUrl } from '../../services/loading/fetchWithProgress';

// An in-flight fetch pins a queue pipe and keeps the render-on-demand loop
// ticking, so a promise that never settles leaks more than a socket.
const FETCH_DEADLINE_MS = 10_000;

/**
 * fetchHeightTile — one `shgt1` tile, decoded ready for atlas upload, or
 * `null` if it is not there.
 *
 * A 404 is the normal case (the height pyramid is as sparse as the albedo
 * one), and so is a rejected payload: an HTML error page from a throttled
 * origin fails `decodeHeightTile`'s magic check. Both degrade to `null`, which
 * the stream subsystem memoises as failed, rather than an exception that would
 * take the frame down.
 */
export async function fetchHeightTile(
  tile: SurfaceTileId,
  prefix: string,
): Promise<HeightTile | null> {
  const url = dataUrl(`images/${surfaceTilePath(tile, prefix)}`);
  try {
    const res = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
    });
    if (!res.ok) return null;
    return decodeHeightTile(await res.arrayBuffer());
  } catch {
    return null;
  }
}
