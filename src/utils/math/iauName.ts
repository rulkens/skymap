/**
 * Construct an IAU-style coordinate-based galaxy designation, prefixed by
 * the survey's canonical short name.
 *
 * IAU recommends survey name + "J" + truncated coords as a stable, source-
 * derived identifier when no internal catalog ID is preferred — that's the
 * convention SDSS, 2MASS, etc. all follow.  Reusing the format across our
 * surveys keeps the headline string visually consistent (same length, same
 * truncation rules) while still telling the user which catalog the row
 * actually came from.
 *
 * Per-survey prefixes live on `SOURCE_REGISTRY[source].iauPrefix`
 * (e.g. SDSS → "SDSS J…", 2MRS → "2MASX J…", Milliquas → "MQ J…").
 *
 * The coordinate part itself is identical across surveys and lives in
 * `iauRaDecSuffix.ts` so any consumer that needs to glue a non-survey
 * prefix (e.g. Milliquas's per-row `parentSurveyByte`-derived prefix)
 * onto the same coord string can share the emitter byte-for-byte.
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 */

import { iauRaDecSuffix } from './iauRaDecSuffix';
import { SOURCE_REGISTRY } from '../../data/sources';
import type { SourceType } from '../../@types/data/SourceType';

/**
 * Survey-aware IAU designation.  Returns "<prefix> J<RA><Dec>" where the
 * prefix matches the source's canonical short name.
 *
 * Throws for structure sources (Cluster/Supercluster/Void) — those markers
 * carry curated names (e.g. "Virgo Cluster") and have no IAU coordinate
 * designation. Reaching the throw means a structure pick is being formatted by
 * galaxy-headline code; route structure picks through their dedicated info path.
 */
export function iauName(source: SourceType, raDeg: number, decDeg: number): string {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'survey') {
    throw new Error(`iauName: structure source ${source} has no IAU designation`);
  }
  return `${entry.iauPrefix} ${iauRaDecSuffix(raDeg, decDeg)}`;
}
