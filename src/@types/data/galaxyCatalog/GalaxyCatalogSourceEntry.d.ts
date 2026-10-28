import type { BandLabels } from './BandLabels';
import type { ColourIndexSpec } from './ColourIndexSpec';
import type { GalaxyDurableIdClaim } from './GalaxyDurableIdClaim';
import type { SchechterTriple } from './SchechterTriple';
import type { SourceEntryBase } from '../SourceEntryBase';
import type { Tier } from '../Tier';

/**
 * Galaxy catalog-typed row of the SOURCE_REGISTRY — all the per-galaxy-catalog metadata
 * needed by the UI, the loader, and the camera, colocated so adding a new
 * galaxy catalog means editing one place.
 */
export type GalaxyCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'galaxyCatalog';
  /** Stable numeric tag, matching the `.bin` file format byte. */
  readonly code: number;
  /**
   * Filename stem under `public/data/` (and on R2). Tier-aware sources get
   * `-<tier>` appended by `tierFilenameForSource`.
   */
  readonly binBaseName: string;
  /**
   * Approximate effective depth used to frame the camera, in megaparsecs.
   * Not a strict cut — outliers may sit beyond.
   */
  readonly maxDistMpc: number;
  /** Band each `magU/G/R/I/Z` slot actually carries on this source. */
  readonly bandLabels: BandLabels;
  /** Colour-index recipe; consumer is `pickColourIndex` in `data/colourIndex.ts`. */
  readonly colourSpec: ColourIndexSpec;
  /** Apparent-magnitude flux limit in the band that defines the selection (SDSS r, 2MRS K_s, GLADE B); Malmquist-bias correction. */
  readonly mLim: number;
  /** Schechter luminosity-function triple `(M*, α, φ*)` in the flux-limit band. */
  readonly schechter: SchechterTriple;
  /**
   * Short-name prefix for IAU-style designations (`<prefix> J<RA><Dec>`), e.g.
   * `'SDSS'`, `'2MASX'`, `'GLADE'`; consumed by `utils/math/iauName.ts`.
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
   * Tier-agnostic catalogs (2MRS, Famous) carry `{}`.
   */
  readonly tierTargets: Partial<Record<Tier, number>>;
  /**
   * Apparent-magnitude flux floor (`magG` slot) for the local-volume
   * supplement: the tier build keeps every galaxy brighter than this in
   * addition to the brightest-N-by-M_abs backbone. A flux floor adds no
   * distance shell and is z-independent, so it rescues negative-cz Local Group
   * members the M_abs cut drops. Only consulted on capped tiers.
   */
  readonly fluxSupplementMagLimit?: number;
  /** Multiplier on surface-brightness intensity (1.0 = none), via `SourceUniforms`; lifts faint catalogs such as Milliquas. */
  readonly sbBoost: number;
  /** Half-distance (Mpc) of the depth fade `1 / (1 + (d / falloffHalfMpc)²)`; a very large value disables it. */
  readonly falloffHalfMpc: number;
  /** Fetch rank of the asset row minted here; see `AssetWiringRow.priority`. */
  readonly priority: number;
  /** The durable id kind this source's `objIDs` carry; absent when they carry none a URL may name. */
  readonly durableId?: GalaxyDurableIdClaim;
};
