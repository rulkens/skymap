import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileArchiveIndex } from '../../archive/@types/SurfaceTileArchiveIndex';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';
import type { TileRead } from '../@types/TileRead';
import { decodeSurfaceTileArchiveIndex } from '../../archive/utils/decodeSurfaceTileArchiveIndex';
import { findSurfaceTileArchiveEntry } from '../../archive/utils/findSurfaceTileArchiveEntry';
import { surfaceTileArchivePath } from '../../archive/utils/surfaceTileArchivePath';
import { surfaceTileMortonKey } from '../../archive/utils/surfaceTileMortonKey';
import { dataUrl } from '../../../../../services/loading/fetchWithProgress';

// An in-flight fetch pins a queue pipe and keeps the render-on-demand loop
// ticking, so a promise that never settles leaks more than a socket.
const FETCH_DEADLINE_MS = 10_000;

/**
 * createArchiveTileSource — reads tiles from per-level `.idx` + `.pack`
 * archives under `prefix` with one Range request each (layout: the surface
 * tile archives spec).
 *
 * A missing tile or a missing level index is the normal case (both imagery
 * sources are land-oriented), so it reads `'missing'` quietly. A part answering
 * 200 means the edge ignored Range and sent the whole pack: warn once, skip.
 */
export function createArchiveTileSource(prefix: string): SurfaceTileSource {
  // A memoised 'failed' is a corrupt index: a broken deploy, which no retry mends.
  const indexes = new Map<string, Promise<SurfaceTileArchiveIndex | 'missing' | 'failed'>>();
  let warnedNoRange = false;

  async function fetchIndex(
    tile: SurfaceTileId,
  ): Promise<SurfaceTileArchiveIndex | 'missing' | 'failed'> {
    const url = dataUrl(`images/${surfaceTileArchivePath(prefix, tile.product, tile.z)}`);
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(FETCH_DEADLINE_MS) });
    if (res.status === 404) return 'missing';
    if (!res.ok) throw new Error(`archive index ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      return decodeSurfaceTileArchiveIndex(bytes);
    } catch {
      // Never 'missing': a level that reads as missing must mean nothing was baked there.
      return 'failed';
    }
  }

  function indexOf(tile: SurfaceTileId): Promise<SurfaceTileArchiveIndex | 'missing' | 'failed'> {
    const id = `${tile.product}:${tile.z}`;
    let pending = indexes.get(id);
    if (!pending) {
      const fetching = fetchIndex(tile);
      pending = fetching;
      indexes.set(id, fetching);
      // A network error, deadline or 5xx must not poison the level for the session.
      fetching.catch(() => {
        if (indexes.get(id) === fetching) indexes.delete(id);
      });
    }
    return pending;
  }

  return {
    async readTile(tile: SurfaceTileId): Promise<TileRead> {
      try {
        const index = await indexOf(tile);
        if (index === 'missing' || index === 'failed') return { kind: index };
        const entry = findSurfaceTileArchiveEntry(index, surfaceTileMortonKey(tile.x, tile.y));
        if (!entry) return { kind: 'missing' };
        // Answered without a fetch: `bytes=o-(o-1)` is not a valid Range.
        if (entry.length === 0) return { kind: 'empty' };
        const url = dataUrl(
          `images/${surfaceTileArchivePath(prefix, tile.product, tile.z, entry.part)}`,
        );
        const res = await fetch(url, {
          mode: 'cors',
          signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
          headers: { Range: `bytes=${entry.offset}-${entry.offset + entry.length - 1}` },
        });
        if (res.status !== 206) {
          void res.body?.cancel();
          if (res.status === 200 && !warnedNoRange) {
            warnedNoRange = true;
            console.warn(`surface tiles: ${url} ignored Range (200); tiles will not load`);
          }
          return { kind: 'failed' };
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.byteLength === entry.length ? { kind: 'bytes', bytes } : { kind: 'failed' };
      } catch {
        return { kind: 'failed' };
      }
    },
  };
}
