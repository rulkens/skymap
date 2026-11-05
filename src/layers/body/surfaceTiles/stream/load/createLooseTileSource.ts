import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';
import { surfaceTilePath } from '../../format/utils/surfaceTilePath';
import { dataUrl } from '../../../../../services/loading/fetchWithProgress';

// An in-flight fetch pins a queue pipe and keeps the render-on-demand loop
// ticking, so a promise that never settles leaks more than a socket.
const FETCH_DEADLINE_MS = 10_000;

/**
 * createLooseTileSource — one HTTP file per tile under `prefix`.
 *
 * A 404 is the normal case, not an error: both imagery sources are
 * land-oriented, so most of the grid doesn't exist. A miss returns `null` and
 * logs nothing; the stream subsystem memoises it as failed.
 */
export function createLooseTileSource(prefix: string): SurfaceTileSource {
  return {
    async readTile(tile: SurfaceTileId): Promise<Uint8Array<ArrayBuffer> | null> {
      try {
        const res = await fetch(dataUrl(`images/${surfaceTilePath(tile, prefix)}`), {
          mode: 'cors',
          signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
        });
        if (!res.ok) return null;
        // A throttled origin answers with an HTML error page, which would
        // make the bitmap decode throw rather than return null.
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    },
  };
}
