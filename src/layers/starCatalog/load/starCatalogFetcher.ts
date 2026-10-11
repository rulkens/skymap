/**
 * starCatalogFetcher — `Fetcher<StarOctree, StarCatalogReq>`.
 *
 * ONE fetcher for EVERY `starCatalog` row of the SOURCE_REGISTRY, keyed by
 * `req.source`. Unlike the galaxy fetcher — which reaches for
 * `tierFilenameForSource` (that helper narrows to galaxy-catalog rows,
 * see `tierTargets.ts`) — this builds the filename directly from the
 * source entry's own `binBaseName`. Parameterizing by `req.source` rather
 * than hard-coding the Gaia row is what lets a future famous-star catalog
 * reuse this fetcher unchanged: the request dimension IS the reuse seam.
 *
 * ### Two formats, one shape
 *
 * The row's `format` picks the file: `skst` is one `-<tier>.bin` per tier,
 * run through the sealed compression codec (`starBinCodec.ts`) so its decode
 * is async; `octree` is one tier-less index object (the tier sizes the chunk
 * pool instead). Both adapt to the `StarOctree` the renderer draws.
 *
 * ### Type guard, not a cast
 *
 * `SOURCE_REGISTRY[req.source]` is the full `SourceEntry` union; the runtime
 * check both narrows it to `SurveyStarCatalogSourceEntry` (giving
 * `binBaseName`) AND fails loudly if a caller wires this fetcher to
 * a source that ships no bin — a config bug the type system can't catch once
 * the request's `source` is a broad `SourceType`. The `binBaseName !== null`
 * half of the guard is what excludes a SEEDED star catalog: it is built in
 * code, so there is no filename to assemble and nothing to fetch.
 *
 * On 404 the slot machinery's error path leaves the catalog unregistered;
 * the star layer simply doesn't draw.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import { SOURCE_REGISTRY } from '../../../data/sources';
import {
  decodeSkstCatalog,
  STAR_CATALOG_DATA_PREFIX,
} from '../../../data/starCatalog/starCatalogFormat';
import { starIndexPath } from '../../../data/octree/octreeFormat';
import { decodeOctreeIndex } from '../../../data/octree/decodeOctreeIndex';
import { starOctreeFromSkst } from '../../../utils/star/starOctreeFromSkst';
import { starOctreeFromIndex } from '../../../utils/star/starOctreeFromIndex';
import { dataUrl, fetchWithProgress } from '../../../services/loading/fetchWithProgress';

export const starCatalogFetcher: Fetcher<StarOctree, StarCatalogReq> = async (
  req,
  signal,
  onProgress,
) => {
  const entry = SOURCE_REGISTRY[req.source];
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) {
    throw new Error(`starCatalogFetcher: source ${req.source} is not a streamed star catalog`);
  }
  if (entry.format === 'octree') {
    const buf = await fetchWithProgress(
      dataUrl(starIndexPath(entry.binBaseName)),
      signal,
      onProgress,
    );
    return starOctreeFromIndex(decodeOctreeIndex(buf));
  }
  const name = `${entry.binBaseName}-${req.tier}.bin`;
  const buf = await fetchWithProgress(
    dataUrl(`${STAR_CATALOG_DATA_PREFIX}/${name}`),
    signal,
    onProgress,
  );
  return starOctreeFromSkst(await decodeSkstCatalog(buf));
};
