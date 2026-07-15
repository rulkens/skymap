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
 * `type !== 'starCatalog'` check both narrows it to `StarCatalogSourceEntry`
 * (giving `binBaseName` / `tiered`) AND fails loudly if a caller wires this
 * fetcher to a non-star source — a config bug the type system can't catch
 * once the request's `source` is a broad `SourceType`.
 *
 * On 404 the slot machinery's error path leaves the catalog unregistered;
 * the star layer simply doesn't draw. Mirrors the mcpmFetcher fallback.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogSourceEntry } from '../../../@types/data/starCatalog/StarCatalogSourceEntry';
import { SOURCE_REGISTRY } from '../../../data/sources';
import { decodeStarCatalog } from '../../../data/starCatalog/starCatalogFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const starCatalogFetcher: Fetcher<StarCatalog, StarCatalogReq> = async (
  req,
  signal,
  onProgress,
) => {
  const entry = SOURCE_REGISTRY[req.source];
  if (entry.type !== 'starCatalog') {
    throw new Error(`starCatalogFetcher: source ${req.source} is not a star catalog`);
  }
  // Widen from the concrete Gaia row to the general StarCatalogSourceEntry
  // contract (`tiered: boolean`): the current sole star source pins
  // `tiered: true` as a const literal, which would render the untiered
  // `${base}.bin` branch below dead code (an unreachable `never`). Binding
  // to the type keeps both branches live so a future untiered star catalog
  // fetches correctly.
  const starEntry: StarCatalogSourceEntry = entry;
  const name = starEntry.tiered
    ? `${starEntry.binBaseName}-${req.tier}.bin`
    : `${starEntry.binBaseName}.bin`;
  const buf = await fetchWithProgress(dataUrl(name), signal, onProgress);
  return decodeStarCatalog(buf);
};
