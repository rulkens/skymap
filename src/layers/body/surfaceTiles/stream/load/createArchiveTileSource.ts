import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileArchiveIndex } from '../../format/@types/SurfaceTileArchiveIndex';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';
import { decodeSurfaceTileArchiveIndex } from '../../format/utils/decodeSurfaceTileArchiveIndex';
import { findSurfaceTileArchiveEntry } from '../../format/utils/findSurfaceTileArchiveEntry';
import { surfaceTileArchivePath } from '../../format/utils/surfaceTileArchivePath';
import { surfaceTileMortonKey } from '../../format/utils/surfaceTileMortonKey';
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
 * sources are land-oriented), so it returns `null` quietly. A part answering
 * 200 means the edge ignored Range and sent the whole pack: warn once, skip.
 */
export function createArchiveTileSource(prefix: string): SurfaceTileSource {
  const indexes = new Map<string, Promise<SurfaceTileArchiveIndex | null>>();
  let warnedNoRange = false;

  async function fetchIndex(tile: SurfaceTileId): Promise<SurfaceTileArchiveIndex | null> {
    const url = dataUrl(`images/${surfaceTileArchivePath(prefix, tile.product, tile.z)}`);
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(FETCH_DEADLINE_MS) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`archive index ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      return decodeSurfaceTileArchiveIndex(bytes);
    } catch {
      // A malformed index will not mend on a retry: the level reads as empty.
      return null;
    }
  }

  function indexOf(tile: SurfaceTileId): Promise<SurfaceTileArchiveIndex | null> {
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
    async readTile(tile: SurfaceTileId): Promise<Uint8Array<ArrayBuffer> | null> {
      try {
        const index = await indexOf(tile);
        if (!index) return null;
        const entry = findSurfaceTileArchiveEntry(index, surfaceTileMortonKey(tile.x, tile.y));
        if (!entry) return null;
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
          return null;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.byteLength === entry.length ? bytes : null;
      } catch {
        return null;
      }
    },
  };
}
