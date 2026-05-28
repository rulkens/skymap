import type { BandLabels } from './BandLabels';
import type { ColourIndexSpec } from './ColourIndexSpec';
import type { SchechterTriple } from './SchechterTriple';
import type { SourceEntryBase } from './SourceEntryBase';
import type { Tier } from './Tier';

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
  /**
   * Short-name prefix for IAU-style coordinate designations
   * (`<prefix> J<RA><Dec>`), e.g. `'SDSS'`, `'2MASX'`, `'GLADE'`. Each
   * survey uses the upstream catalogue's own short-name convention; see
   * `utils/math/iauName.ts` for the consumer.
   */
  readonly iauPrefix: string;
  /**
   * Per-tier point-count caps applied at build time. Three encodings:
   *
   *   missing key  → no cap; ship the source unchanged.
   *   0            → exclude this source from this tier entirely (the
   *                  build skips writing the file; runtime gets a 404).
   *   positive N   → keep the brightest N galaxies by absolute magnitude.
   *
   * Tier-agnostic surveys (2MRS, Famous, Synthetic) carry `{}` — no caps
   * anywhere, one file shared across tiers.
   */
  readonly tierTargets: Partial<Record<Tier, number>>;
  /**
   * Per-source floor of the points intensity formula
   * `clamp((22 − magnitude) / 8, intensityFloor, 1)`. Plumbed through
   * `SourceUniforms` to `points/vertex.wesl`. Replaces a prior hardcoded
   * 0.05 floor; per-source tuning lets sparse far-field catalogs
   * (Milliquas, where most rows sit past mag 22) carry a higher floor
   * to stay visible, while bulk galaxy surveys take a lower floor to
   * reduce per-galaxy contribution to the additive HDR target in dense
   * regions (and thus tame center saturation under the Reinhard tonemap).
   */
  readonly intensityFloor: number;
  /**
   * Per-source half-distance (Mpc) of the depth-fade curve
   * `1 / (1 + (d / falloffHalfMpc)²)`. Plumbed through `SourceUniforms`
   * to `points/vertex.wesl`. Replaces a prior hardcoded 1000 Mpc.
   * Sparse far-field catalogs (Milliquas reaches d ~ 8000 Mpc) set a
   * very large value to effectively disable the fade; bulk galaxy
   * surveys keep the original ~1000 Mpc tuning.
   */
  readonly falloffHalfMpc: number;
};
