import type { BandLabels } from './BandLabels';
import type { ColourIndexSpec } from './ColourIndexSpec';
import type { SchechterTriple } from './SchechterTriple';
import type { SourceEntryBase } from '../SourceEntryBase';
import type { Tier } from '../Tier';

/**
 * Galaxy catalog-typed row of the SOURCE_REGISTRY — all the per-galaxy-catalog metadata
 * needed by the UI, the loader, and the camera, colocated so adding a new
 * galaxy catalog means editing one place.
 *
 * `binBaseName` is `null` for sources without an on-disk file (e.g. the
 * Synthetic procedurally-generated cloud); every other field is required.
 */
export type GalaxyCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'galaxyCatalog';
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
   * Apparent-magnitude flux limit for the galaxy catalog, in the band that defines
   * its selection (SDSS r, 2MRS K_s, GLADE B, …). Used by the Malmquist-
   * bias correction; the band is recorded in {@link bandLabels} / {@link
   * colourSpec}, so call sites that need the value look it up here.
   */
  readonly mLim: number;
  /**
   * Schechter luminosity-function triple `(M*, α, φ*)` for the band that
   * defines the galaxy catalog's flux limit. Used by the Schechter-density
   * pathway of the bias correction.
   */
  readonly schechter: SchechterTriple;
  /**
   * Short-name prefix for IAU-style coordinate designations
   * (`<prefix> J<RA><Dec>`), e.g. `'SDSS'`, `'2MASX'`, `'GLADE'`. Each
   * galaxy catalog uses the upstream catalogue's own short-name convention; see
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
   * Tier-agnostic galaxy catalogs (2MRS, Famous, Synthetic) carry `{}` — no caps
   * anywhere, one file shared across tiers.
   */
  readonly tierTargets: Partial<Record<Tier, number>>;
  /**
   * Apparent-magnitude flux floor for the local-volume supplement, read from
   * the `magG` slot (the galaxy catalog's selection-band apparent mag). When set, the
   * tier build keeps every galaxy brighter than this *in addition to* the
   * brightest-N-by-M_abs backbone, so the volume-limited cut doesn't empty the
   * local volume. A flux floor tapers smoothly with distance, so it adds no
   * shell; it is also z-independent, so it rescues negative-cz Local Group
   * members the M_abs cut drops. Omit for sources that need no supplement
   * (2MRS ships uncapped; the others have no local-volume coverage worth
   * recovering). Only consulted on capped tiers — a no-op when uncapped.
   */
  readonly fluxSupplementMagLimit?: number;
  /**
   * Per-source multiplier on the physical surface-brightness intensity
   * (1.0 = no boost). Plumbed through `SourceUniforms` to
   * `points/vertex.wesl`. Raise it to lift intrinsically-faint catalogs
   * (e.g. Milliquas quasars) that the physical model renders dim.
   */
  readonly sbBoost: number;
  /**
   * Per-source half-distance (Mpc) of the depth-fade curve
   * `1 / (1 + (d / falloffHalfMpc)²)`. Plumbed through `SourceUniforms`
   * to `points/vertex.wesl`. Replaces a prior hardcoded 1000 Mpc.
   * Sparse far-field catalogs (Milliquas reaches d ~ 8000 Mpc) set a
   * very large value to effectively disable the fade; bulk galaxy
   * catalogs keep the original ~1000 Mpc tuning.
   */
  readonly falloffHalfMpc: number;
};
