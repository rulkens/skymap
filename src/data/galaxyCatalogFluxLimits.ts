/**
 * Per-galaxy catalog flux limits and Schechter luminosity-function parameters —
 * thin accessors over `SOURCE_REGISTRY`. The actual numbers live on each
 * galaxy catalog entry (see `sources.ts`); this module only adds the non-galaxy catalog throw
 * guard so callers that hand us a raw `Source` get a loud error rather
 * than silently reading `undefined`.
 */

import { SOURCE_REGISTRY } from './sources';
import type { SchechterTriple } from '../@types/data/SchechterTriple';
import type { SourceType } from '../@types/data/SourceType';

/** Per-galaxy catalog apparent-magnitude flux limit (band varies — see `bandLabels`). */
export function galaxyCatalogFluxLimit(source: SourceType): number {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog') {
    throw new Error(`galaxyCatalogFluxLimit: non-galaxy catalog source ${source} has no flux limit`);
  }
  return entry.mLim;
}

/** Per-galaxy catalog Schechter triple for the band that defines the flux limit. */
export function galaxyCatalogSchechter(source: SourceType): SchechterTriple {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog') {
    throw new Error(`galaxyCatalogSchechter: non-galaxy catalog source ${source} has no Schechter triple`);
  }
  return entry.schechter;
}
