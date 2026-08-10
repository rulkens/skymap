/**
 * starCatalogFetcher — `Fetcher<StarCatalog, StarCatalogReq>`.
 *
 * ONE fetcher for EVERY `starCatalog` row of the SOURCE_REGISTRY, keyed by
 * `req.source`. Unlike the galaxy fetcher — which reaches for
 * `tierFilenameForSource` (that helper narrows to galaxy-catalog rows,
 * see `tierTargets.ts`) — this builds the filename directly from the
 * source entry's own `binBaseName`. Parameterizing by `req.source` rather
 * than hard-coding the Gaia row is what lets a future famous-star catalog
 * reuse this fetcher unchanged: the request dimension IS the reuse seam.
 *
 * ### Filename: tiered vs untiered
 *
 * A tiered source (`tiered: true`) ships per-resolution `.bin` variants and
 * reloads on a tier flip — the population change (a larger/smaller Gaia
 * star count) is the user-visible point of the tier dropdown for this
 * layer. An untiered star catalog would ship a single `${base}.bin`,
 * mirroring the galaxy side's `famous.bin` path. The branch is on the
 * entry's `tiered` flag, so both shapes route through the same fetcher.
 *
 * ### Async decode
 *
 * Unlike the galaxy catalogs, `decodeStarCatalog` is *async*: the on-disk
 * `.bin` is run through the sealed compression codec (`starBinCodec.ts`),
 * so decode inflates before parsing and the fetcher must await it — a
 * synchronous return would hand back an unresolved promise.
 *
 * ### Type guard, not a cast
 *
 * `SOURCE_REGISTRY[req.source]` is the full `SourceEntry` union; the runtime
 * check both narrows it to `SurveyStarCatalogSourceEntry` (giving
 * `binBaseName` / `tiered`) AND fails loudly if a caller wires this fetcher to
 * a source that ships no bin — a config bug the type system can't catch once
 * the request's `source` is a broad `SourceType`. The `binBaseName !== null`
 * half of the guard is what excludes a SEEDED star catalog: it is built in
 * code, so there is no filename to assemble and nothing to fetch.
 *
 * On 404 the slot machinery's error path leaves the catalog unregistered;
 * the star layer simply doesn't draw. Mirrors the mcpmFetcher fallback.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { SurveyStarCatalogSourceEntry } from '../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';
import { SOURCE_REGISTRY } from '../../../data/sources';
import {
  decodeStarCatalog,
  STAR_CATALOG_DATA_PREFIX,
} from '../../../data/starCatalog/starCatalogFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const starCatalogFetcher: Fetcher<StarCatalog, StarCatalogReq> = async (
  req,
  signal,
  onProgress,
) => {
  const entry = SOURCE_REGISTRY[req.source];
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) {
    throw new Error(`starCatalogFetcher: source ${req.source} is not a streamed star catalog`);
  }
  // Re-bind to the general SurveyStarCatalogSourceEntry contract before
  // branching on 'tiered'. Several registry rows (the volume entries) also
  // carry a literal 'tiered' field, which makes 'tiered' a discriminant of the
  // registry union — so a ternary on the guard-narrowed entry's literal
  // 'tiered: true' narrows the entry itself to 'never' in the untiered
  // branch and 'entry.binBaseName' fails to typecheck there. Widening to
  // 'tiered: boolean' keeps both branches live; the untiered `${base}.bin`
  // path mirrors the galaxy side's famous.bin and serves the next,
  // untiered star catalog.
  const starEntry: SurveyStarCatalogSourceEntry = entry;
  const name = starEntry.tiered
    ? `${starEntry.binBaseName}-${req.tier}.bin`
    : `${starEntry.binBaseName}.bin`;
  const buf = await fetchWithProgress(
    dataUrl(`${STAR_CATALOG_DATA_PREFIX}/${name}`),
    signal,
    onProgress,
  );
  return decodeStarCatalog(buf);
};
