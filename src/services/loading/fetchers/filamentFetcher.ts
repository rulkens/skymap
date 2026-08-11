/**
 * filamentFetcher — Fetcher<FilamentCloud, FilamentReq>.
 *
 * Tier-aware filename: `filaments-small.bin` for the small tier (built with
 * a higher DisPerSE persistence cut, ~10–15 MB) vs `filaments.bin` for
 * medium/large (~30 MB). Mobile-tier rationale documented in the original
 * cloudLoader.filamentFilenameForTier docblock — preserved here.
 *
 * NOTE: engine.ts only calls this slot's `load()` once at boot and never on
 * tier change. Filaments don't swap on tier flip — re-downloading tens of
 * MB for what is mostly the same skeleton topology isn't worth it, and a
 * desktop user starting on `small` (rare) sees the smaller skeleton until
 * a hard reload.
 *
 * ### Why a tiny fetcher rather than reusing galaxyCatalogFetcher
 *
 * The decode step calls `decodeFilaments` (a different binary format —
 * segments instead of points) and the request shape only carries `tier`,
 * not `source`. Splitting them keeps each fetcher's typed request narrow
 * and avoids a "what does source mean for filaments?" branch in the
 * galaxy-catalog fetcher.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/filament/FilamentCloud';
import { decodeFilaments, FILAMENT_DATA_PREFIX } from '../../../data/filament/filamentBinaryFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const filamentFetcher: Fetcher<FilamentCloud, FilamentReq> = async (
  req,
  signal,
  onProgress,
) => {
  const filename = req.tier === 'small' ? 'filaments-small.bin' : 'filaments.bin';
  const buf = await fetchWithProgress(
    dataUrl(`${FILAMENT_DATA_PREFIX}/${filename}`),
    signal,
    onProgress,
  );
  return decodeFilaments(buf);
};
