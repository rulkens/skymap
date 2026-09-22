/**
 * filamentFetcher — Fetcher<FilamentCloud, FilamentReq>.
 *
 * Two files: `filaments-small.bin` for the small tier (a higher DisPerSE
 * persistence cut, ~10–15 MB) vs `filaments.bin` for medium/large (~30 MB).
 * The request names which one (`FilamentReq.small`), so the fetcher does not
 * re-derive it from a tier the caller already resolved.
 *
 * ### Why a tiny fetcher rather than reusing galaxyCatalogFetcher
 *
 * The decode step calls `decodeFilaments` (a different binary format —
 * segments instead of points) and the request carries no `source`. Splitting
 * them keeps each fetcher's typed request narrow and avoids a "what does
 * source mean for filaments?" branch in the galaxy-catalog fetcher.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/filament/FilamentCloud';
import { decodeFilaments, FILAMENT_DATA_PREFIX } from '../../../data/filament/filamentBinaryFormat';
import { dataUrl, fetchWithProgress } from '../../../services/loading/fetchWithProgress';

export const filamentFetcher: Fetcher<FilamentCloud, FilamentReq> = async (
  req,
  signal,
  onProgress,
) => {
  const filename = req.small ? 'filaments-small.bin' : 'filaments.bin';
  const buf = await fetchWithProgress(
    dataUrl(`${FILAMENT_DATA_PREFIX}/${filename}`),
    signal,
    onProgress,
  );
  return decodeFilaments(buf);
};
