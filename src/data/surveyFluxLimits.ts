/**
 * Per-survey flux limits and Schechter luminosity-function parameters —
 * thin accessors over `SOURCE_REGISTRY`. The actual numbers live on each
 * survey entry (see `sources.ts`); this module only adds the POI throw
 * guard so callers that hand us a raw `Source` get a loud error rather
 * than silently reading `undefined`.
 */

import { Source, SOURCE_REGISTRY } from './sources';
import type { SchechterTriple } from '../@types/data/SchechterTriple';
import type { SourceType } from '../@types/data/Source';

/** Per-survey apparent-magnitude flux limit (band varies — see `bandLabels`). */
export function surveyFluxLimit(source: SourceType): number {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'survey') {
    throw new Error(`surveyFluxLimit: POI source ${source} has no flux limit`);
  }
  return entry.mLim;
}

/** Per-survey Schechter triple for the band that defines the flux limit. */
export function surveySchechter(source: SourceType): SchechterTriple {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'survey') {
    throw new Error(`surveySchechter: POI source ${source} has no Schechter triple`);
  }
  return entry.schechter;
}
