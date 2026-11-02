import { GALAXY_CATALOG_SOURCE_RECORD } from '../../../layers/galaxyCatalog/sources/galaxyCatalogSourceRecord';
import { shipsTierVariants } from '../../../utils/loading/shipsTierVariants';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyCatalogSourceType } from '../../../layers/galaxyCatalog/@types/GalaxyCatalogSourceType';
import type { Tier } from '../../../@types/data/Tier';

/** The ONE point-source request. */
export function galaxyCatalogRequest(
  source: GalaxyCatalogSourceType,
  tier: Tier,
): GalaxyCatalogReq {
  // A tier the source has no file for would drift on every flip and re-fetch the
  // same bytes; `shipsTierVariants` is the same predicate that picks the filename.
  if (!shipsTierVariants(GALAXY_CATALOG_SOURCE_RECORD[source].tierTargets)) return { source };
  return { source, tier };
}
