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
 * Designations by source:
 *   - SDSS:      "SDSS J<RA><Dec>"      e.g. "SDSS J123456.75+012345.5"
 *   - 2MRS:      "2MASX J<RA><Dec>"     (2MRS rows carry 2MASS XSC IDs)
 *   - GLADE:     "GLADE J<RA><Dec>"     (GLADE is a compilation; the prefix
 *                                         marks it as such even though the
 *                                         underlying provenance varies)
 *   - Synthetic: "Synth J<RA><Dec>"     (no real-world catalog; obvious tag)
 *   - Famous:    "Famous J<RA><Dec>"    (fallback when no curated name)
 *   - Milliquas: "MQ J<RA><Dec>"        (catalog's own short name)
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
import { Source } from '../../data/sources';

/**
 * Survey-aware IAU designation.  Returns "<prefix> J<RA><Dec>" where the
 * prefix matches the source's canonical short name.
 */
export function iauName(source: Source, raDeg: number, decDeg: number): string {
  const coords = iauRaDecSuffix(raDeg, decDeg);
  switch (source) {
    case Source.SDSS:
      return `SDSS ${coords}`;
    case Source.TwoMRS:
      return `2MASX ${coords}`;
    case Source.Glade:
      return `GLADE ${coords}`;
    case Source.Synthetic:
      return `Synth ${coords}`;
    case Source.Famous:
      // Famous entries have proper catalogue names (e.g. "M31") stored in
      // the metadata sidecar.  The IAU designation is used as a fallback
      // when no curated name is available (e.g. for a new entry pending
      // metadata enrichment).  "Famous" matches the Source label.
      return `Famous ${coords}`;
    case Source.Milliquas:
      // Milliquas's own short-name convention.  Used when the row's
      // `parentSurveyByte` is the OTHER sentinel — i.e. neither a known
      // parent-survey prefix nor a curated literature name.  The
      // parentSurveyByte-aware reconstruction in `galaxyInfoBuilder`
      // takes precedence when set.
      return `MQ ${coords}`;
    case Source.Cluster:
    case Source.Supercluster:
    case Source.Void:
      // POI markers carry curated names (e.g. "Virgo Cluster") and are
      // not assigned IAU coordinate designations. Reaching here means
      // a POI pick result is being formatted by galaxy-headline code;
      // route POI picks through their dedicated info path instead.
      throw new Error(`iauName: POI source ${source} has no IAU designation`);
  }
}
