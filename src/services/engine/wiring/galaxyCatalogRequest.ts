import { SOURCE_REGISTRY } from '../../../data/sources';
import { shipsTierVariants } from '../../../utils/loading/shipsTierVariants';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { SourceType } from '../../../@types/data/SourceType';
import type { Tier } from '../../../@types/data/Tier';

/** The ONE point-source request. The famous-meta companion row calls it too (D11 will derive it). */
export function galaxyCatalogRequest(source: SourceType, tier: Tier): GalaxyCatalogReq {
  const entry = SOURCE_REGISTRY[source];
  // A tier the source has no file for would drift on every flip and re-fetch the
  // same bytes; `shipsTierVariants` is the same predicate that picks the filename.
  if (entry.type !== 'galaxyCatalog' || !shipsTierVariants(entry.tierTargets)) return { source };
  return { source, tier };
}
