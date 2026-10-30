import { APP_SOURCE_REGISTRY } from '../../compositions/appSources';
import type { SchechterTriple } from '../../@types/data/galaxyCatalog/SchechterTriple';
import type { SourceType } from '../../@types/data/SourceType';

/** Per-galaxy catalog apparent-magnitude flux limit (band varies — see `bandLabels`). */
export function galaxyCatalogFluxLimit(source: SourceType): number {
  const entry = APP_SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog') {
    throw new Error(
      `galaxyCatalogFluxLimit: non-galaxy catalog source ${source} has no flux limit`,
    );
  }
  return entry.mLim;
}

/** Per-galaxy catalog Schechter triple for the band that defines the flux limit. */
export function galaxyCatalogSchechter(source: SourceType): SchechterTriple {
  const entry = APP_SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog') {
    throw new Error(
      `galaxyCatalogSchechter: non-galaxy catalog source ${source} has no Schechter triple`,
    );
  }
  return entry.schechter;
}
