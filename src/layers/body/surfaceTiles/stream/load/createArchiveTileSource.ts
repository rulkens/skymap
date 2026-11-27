import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { ArchiveIndex } from '../../../../../@types/archive/ArchiveIndex';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';
import type { TileRead } from '../@types/TileRead';
import { decodeArchiveIndex } from '../../../../../utils/archive/decodeArchiveIndex';
import { findArchiveEntry } from '../../../../../utils/archive/findArchiveEntry';
import { readArchiveRange } from '../../../../../utils/archive/readArchiveRange';
import { ARCHIVE_FETCH_DEADLINE_MS } from '../../../../../data/archive/archiveFetchDeadlineMs';
import { surfaceTileArchivePath } from '../../archive/utils/surfaceTileArchivePath';
import { surfaceTileMortonKey } from '../../archive/utils/surfaceTileMortonKey';
import { dataUrl } from '../../../../../../packages/shared/src/services/loading/fetchWithProgress';

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
  const indexes = new Map<string, Promise<ArchiveIndex | 'missing' | 'failed'>>();
  // The same answers once landed, so the planner can ask synchronously what a level lacks.
  const landed = new Map<string, ArchiveIndex | 'missing' | 'failed'>();
  let warnedNoRange = false;
  const levelId = (tile: SurfaceTileId) => `${tile.product}:${tile.z}`;

  async function fetchIndex(tile: SurfaceTileId): Promise<ArchiveIndex | 'missing' | 'failed'> {
    const url = dataUrl(`images/${surfaceTileArchivePath(prefix, tile.product, tile.z)}`);
    const res = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(ARCHIVE_FETCH_DEADLINE_MS),
    });
    if (res.status === 404) return 'missing';
    if (!res.ok) throw new Error(`archive index ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      return decodeArchiveIndex(bytes);
    } catch {
      // Never 'missing': a level that reads as missing must mean nothing was baked there.
      return 'failed';
    }
  }

  function indexOf(tile: SurfaceTileId): Promise<ArchiveIndex | 'missing' | 'failed'> {
    const id = levelId(tile);
    let pending = indexes.get(id);
    if (!pending) {
      const fetching = fetchIndex(tile);
      pending = fetching;
      indexes.set(id, fetching);
      fetching.then(
        (index) => landed.set(id, index),
        // A network error, deadline or 5xx must not poison the level for the session.
        () => {
          if (indexes.get(id) === fetching) indexes.delete(id);
        },
      );
    }
    return pending;
  }

  return {
    async readTile(tile: SurfaceTileId): Promise<TileRead> {
      try {
        const index = await indexOf(tile);
        if (index === 'missing' || index === 'failed') return { kind: index };
        const entry = findArchiveEntry(index, surfaceTileMortonKey(tile.x, tile.y));
        if (!entry) return { kind: 'missing' };
        // Answered without a fetch: `bytes=o-(o-1)` is not a valid Range.
        if (entry.length === 0) return { kind: 'empty' };
        const url = dataUrl(
          `images/${surfaceTileArchivePath(prefix, tile.product, tile.z, entry.part)}`,
        );
        const read = await readArchiveRange(url, entry);
        if (read.kind !== 'no-range') return read;
        if (!warnedNoRange) {
          warnedNoRange = true;
          console.warn(`surface tiles: ${url} ignored Range (200); tiles will not load`);
        }
        return { kind: 'failed' };
      } catch {
        return { kind: 'failed' };
      }
    },
    isMissing(tile: SurfaceTileId): boolean {
      const index = landed.get(levelId(tile));
      if (index === undefined || index === 'failed') return false;
      return (
        index === 'missing' ||
        findArchiveEntry(index, surfaceTileMortonKey(tile.x, tile.y)) === null
      );
    },
  };
}
