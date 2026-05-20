import type { BandLabels } from './BandLabels';
import type { ColourIndexSpec } from './ColourIndexSpec';
import type { SchechterTriple } from './SchechterTriple';
import type { SourceEntryBase } from './SourceEntryBase';

/**
 * Survey-typed row of the SOURCE_REGISTRY — all the per-survey metadata
 * needed by the UI, the loader, and the camera, colocated so adding a new
 * survey means editing one place.
 *
 * `binBaseName` is `null` for sources without an on-disk file (e.g. the
 * Synthetic procedurally-generated cloud); every other field is required.
 */
export type SurveySourceEntry = SourceEntryBase & {
  readonly type: 'survey';
  /** Stable numeric tag, matching the `.bin` file format byte. */
  readonly code: number;
  /**
   * Filename stem under `public/data/` (and on R2). `null` for sources with
   * no on-disk representation. Tier-aware sources get `-<tier>` appended by
   * `tierFilenameForSource`.
   */
  readonly binBaseName: string | null;
  /**
   * Approximate effective depth used to frame the camera, in megaparsecs.
   * Not a strict cut — outliers may sit beyond.
   */
  readonly maxDistMpc: number;
  /** Band each `magU/G/R/I/Z` slot actually carries on this source. */
  readonly bandLabels: BandLabels;
  /**
   * Recipe for computing this source's colour index — which two band slots
   * to subtract, the natural range that gets remapped to the 0..2 WGSL
   * ramp, and the per-redshift K-correction coefficient. See `pickColourIndex`
   * in `data/colourIndex.ts` for the consumer.
   */
  readonly colourSpec: ColourIndexSpec;
  /**
   * Apparent-magnitude flux limit for the survey, in the band that defines
   * its selection (SDSS r, 2MRS K_s, GLADE B, …). Used by the Malmquist-
   * bias correction; the band is recorded in {@link bandLabels} / {@link
   * colourSpec}, so call sites that need the value look it up here.
   */
  readonly mLim: number;
  /**
   * Schechter luminosity-function triple `(M*, α, φ*)` for the band that
   * defines the survey's flux limit. Used by the Schechter-density
   * pathway of the bias correction.
   */
  readonly schechter: SchechterTriple;
};
