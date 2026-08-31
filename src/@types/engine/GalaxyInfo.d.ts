/**
 * GalaxyInfo — display-ready data for a single galaxy, computed on-demand from
 * raw cloud arrays when the user hovers or selects a point. Surfaced to React
 * via the Redux `selectionRows` slice (saga-resolved display cache).
 */

import type { GalaxyTypeInfo } from '../data/galaxyCatalog/GalaxyTypeInfo';
import { Source } from '../../data/sources';
import type { BandLabels } from '../data/galaxyCatalog/BandLabels';
import type { SourceType } from '../data/SourceType';

/**
 * Display data for a single galaxy point, computed on-demand from the raw
 * cloud arrays.
 *
 * All derived quantities (sexagesimal coords, lookback time, galaxy type, etc.)
 * are pre-computed here in the engine so React components receive ready-to-render
 * values and never import data or physics modules directly.  The computation is
 * on-demand (triggered by hover/select events) so it costs nothing for the 99.9%
 * of points that are never hovered.
 *
 * Fields are grouped into four logical sections below.
 */
export type GalaxyInfo = {
  /** Union discriminant — mirrors SOURCE_REGISTRY's 'galaxyCatalog' type. */
  readonly type: 'galaxyCatalog';

  /** 0-based point index in the loaded cloud. */
  index: number;

  /**
   * SDSS 64-bit object identifier.
   *
   * Stored as `bigint` because SDSS objIDs are 18–19 digit numbers that exceed
   * the safe integer range of JS `number` (2⁵³).  Used to build the Explorer
   * and thumbnail URLs below.
   */
  objID: bigint;

  /** @group World-space position */

  /**
   * World-space X coordinate in Mpc. Same value as `cloud.positions[idx*3+0]`.
   * Carried on `GalaxyInfo` so consumers like the camera-focus button can pivot
   * the orbit camera onto this galaxy without re-deriving xyz from RA/Dec.
   */
  x: number;
  /** World-space Y coordinate in Mpc. */
  y: number;
  /** World-space Z coordinate in Mpc. */
  z: number;

  /** @group Sky coordinates */

  /** Right Ascension in decimal degrees, [0, 360). */
  ra: number;
  /** Declination in decimal degrees, [-90, +90]. */
  dec: number;
  /** RA formatted as HHhMMmSS.sss (pre-computed via physics.formatRaSexagesimal). */
  raSexagesimal: string;
  /** Dec formatted as ±DD°MM'SS.s" (pre-computed via physics.formatDecSexagesimal). */
  decSexagesimal: string;

  /** @group Cosmology */

  /** Spectroscopic redshift z (dimensionless). */
  redshift: number;
  /** Comoving distance in Mpc, computed as √(x²+y²+z²). */
  distanceMpc: number;
  /** Recession velocity in km/s via Hubble's law: v = c·z. */
  hubbleVelocityKmS: number;
  /** Light-travel time in Gyr (how long ago the light we see left the source). */
  lookbackGyr: number;
  /** Human-readable Earth-history anchor for the lookback time, e.g. "during Earth's Mesoproterozoic". */
  earthEra: string;

  /** @group Five-band photometry */

  /** Apparent magnitude in the u-slot — actual band is source-dependent (see `bands.u`). */
  magU: number;
  /** Apparent magnitude in the g-slot — primary brightness proxy. Actual band is source-dependent (see `bands.g`). */
  magG: number;
  /** Apparent magnitude in the r-slot — see `bands.r` for the actual band. */
  magR: number;
  /** Apparent magnitude in the i-slot — see `bands.i` for the actual band. */
  magI: number;
  /** Apparent magnitude in the z-slot — see `bands.z` for the actual band. */
  magZ: number;

  /**
   * Names of the actual photometric bands carried in the five mag slots above.
   *
   * Catalog parsers shoehorn whichever bands the source provides into the
   * SDSS-style 5-slot layout, but the bands are NOT universally u/g/r/i/z.
   * Use these labels in the UI so non-SDSS rows aren't mis-labelled.
   *
   * Examples:
   *   - SDSS:  { u:'u', g:'g', r:'r', i:'i', z:'z' }
   *   - 2MRS:  { u:'—', g:'J', r:'H', i:'K', z:'—' }
   *   - GLADE: { u:'—', g:'B', r:'J', i:'H', z:'K' }
   *
   * `'—'` (em-dash) marks an empty slot (no measurement for that source).
   */
  bands: BandLabels;

  /**
   * Pre-computed colour pairs to display in the InfoCard's "Colour" row.
   *
   * Colour indices (band − band differences) are the standard galaxy-type
   * discriminator in astronomy.  Which pairs make sense depends on which
   * bands the source actually measured:
   *   - SDSS  → u−g, g−r, r−i  (the canonical SDSS triplet)
   *   - 2MRS  → J−H, H−K       (no optical, NIR triplet only gives 2 colours)
   *   - GLADE → B−J, J−H, H−K  (B + 2MASS NIR)
   *
   * Pre-computing here keeps the React layer presentational — FullCard just
   * maps over the array — and means the band-pairing logic lives next to the
   * other data-derivation code in `buildGalaxyInfo.ts`.
   */
  colours: Array<{ label: string; value: number }>;

  /** @group Derived quantities */

  /** Absolute magnitude in the g-band, corrected for distance. */
  absoluteMagG: number;
  /**
   * Coarse galaxy classification inferred from the u−r colour index.
   *
   * `category` is intended for UI tinting; `description` is the human-readable
   * string shown in the info card (e.g. "Red, quiescent galaxy").
   */
  galaxyType: GalaxyTypeInfo;

  /**
   * Curated morphological (Hubble) type, pre-formatted for display
   * (e.g. "Barred spiral (SBb)"), or `undefined` when none is known.
   *
   * Only curated famous galaxies carry a morphology; it's an independent fact
   * from the colour-derived `galaxyType` (morphology says nothing about
   * red-sequence vs blue-cloud membership), so it lives in its own field rather
   * than overwriting `galaxyType.description`.  The info card prefers it over
   * the colour description when present: `morphology ?? galaxyType.description`.
   */
  morphology?: string;
  /**
   * Galaxy catalog-aware IAU designation, e.g. "SDSS J123456.75+012345.5",
   * "GLADE J234500.00-104500.5", "2MASX J...".  Built from RA/Dec via
   * `iauName(source, ra, dec)` so the prefix matches the row's actual
   * catalog and the user isn't lied to by an SDSS-shaped name on a
   * GLADE galaxy.
   */
  iauName: string;

  /**
   * Human-readable per-source classification for the row, or `undefined`
   * when the source doesn't define one.
   *
   * Values come from `sourceClassLabel(source, classByte)`:
   * `Source.Milliquas` rows carry an AGN class (e.g. `"Quasar"`,
   * `"BL Lac"`, `"Seyfert-1 broad"`); `Source.DesiDeep` rows carry the
   * LSS tracer population (e.g. `"Luminous Red Galaxy (LRG)"`,
   * `"Quasar (QSO)"`).  For SDSS / 2MRS / GLADE / Famous / Synthetic
   * rows the field is `undefined` and InfoCard consumers are expected
   * to hide the row entirely.
   *
   * The field is optional rather than `string | null` to match the
   * React-idiomatic absent-row pattern used elsewhere in the type
   * (e.g. `famous?`): consumers gate with `info.agnClass && (…)`
   * and an explicit `undefined` keeps the absent-row markup
   * identical to every other "this row doesn't apply" field.
   */
  agnClass?: string;

  /**
   * Set when the row's five mag slots carry no real measurement —
   * today exactly the DESI LRG/ELG/QSO tracers, whose .bin magnitudes
   * are per-tracer synthetic display constants baked in for renderer
   * brightness only.  The builder NaNs the mag fields (which also
   * empties `colours` and voids `absoluteMagG`) and sets this note;
   * the InfoCard renders it in place of the magnitude rows so a
   * constant is never presented as photometry.  `undefined` for every
   * row with real photometry (absent-row pattern, same as `agnClass`).
   */
  photometryNote?: string;

  /**
   * The single best human-readable name for this row, suitable as a
   * headline in the InfoCard / hover preview.  Derived from a small
   * priority ladder:
   *
   *   1. Famous rows → primary curated name from the seed JSON
   *      (e.g. "M31", "NGC 5128").
   *   2. Milliquas rows with a known parent-survey prefix → the
   *      reconstructed "<PARENT> J<RA><Dec>" (e.g.
   *      "SDSS J012345.67+891234.5", "2MASX J…").  Built from the
   *      per-record `parentSurveyByte` slot in the .bin and the
   *      shared `iauRaDecSuffix(ra, dec)` emitter.
   *   3. 2MRS or GLADE rows with a real PGC (objID > 0n) → `PGC <n>`.
   *      PGC numbers are widely indexed by NED / SIMBAD and are
   *      shorter and more memorable than a coord-based name.  For
   *      GLADE the PGC comes directly from the source row; for 2MRS
   *      it's populated by the build-time GLADE→2MRS cross-match.
   *   4. Everything else → `iauName` (the coord-based fallback).
   *
   * Pre-computed in the builder rather than left to each surface
   * (FullCard, CompactCard, command palette) so the headline stays
   * consistent across the UI without each component duplicating the
   * priority rules.
   */
  displayName: string;

  /** @group Source attribution */

  /**
   * Which galaxy catalog this galaxy came from.  Drives the per-source UI badge and
   * decides whether SDSS-specific affordances (Explorer link, SDSS image
   * cutout) are shown for this point.
   */
  source: SourceType;

  /**
   * Display label for the source (e.g. "SDSS", "2MRS", "GLADE").  Pre-resolved
   * from `sourceLabel(source)` in the engine so the React layer never has to
   * import the galaxy-catalog-metadata table.
   */
  sourceLabel: string;

  /** @group External URLs */

  /**
   * External-catalogue links for this object, pre-labelled and ready to render
   * as the InfoCard's "Catalogues" row (each opens in a new tab).  Empty when
   * the row has no resolvable catalogue page (e.g. Synthetic).
   *
   * The builder picks both the URL and its label per-source so the label can't
   * drift from the page it points at:
   *
   *   - SDSS rows with a valid objID → "SDSS Explorer" → SDSS DR18 Quick Look
   *   - 2MRS rows → "NED" → near-position search at the row's RA/Dec.  We
   *     deliberately don't use 2MASX byname here: NED's name index has
   *     coverage gaps for the 2MASX prefix (verified empirically), so a
   *     position search lands more reliably even when one extra click is
   *     required to drill into the object page.
   *   - GLADE rows with a real PGC → "NED" → byname `PGC <n>` (the PGC is
   *     persisted in `objID` — see `tools/parsers/glade.ts`)
   *   - GLADE rows with no PGC → "NED" → near-position search at the row's RA/Dec
   *   - Famous rows → "NED" (byname on the primary curated name) plus a
   *     "Wikipedia" link resolved from the curated names.
   *
   * Pre-resolving here keeps the card presentational — it just maps over the
   * array — and is the single place that knows which page each label points at.
   */
  catalogues: Array<{ label: string; href: string }>;

  /** @group Physical size */

  /**
   * Per-galaxy physical diameter in kiloparsecs.
   *
   * Mirrors `cloud.diameterKpc[idx]` (always finite — fallback-filled at
   * build time).  Drives the focus-tween framing distance in the engine
   * and the diameter row in the InfoCard.  When the parser supplied a
   * real catalog measurement, the value reflects it; otherwise it's
   * `DEFAULT_GALAXY_DIAMETER_KPC = 30`.  See `provenance` below for
   * which is which.
   */
  diameterKpc: number;

  /**
   * Provenance tag describing how `diameterKpc` was derived for this row,
   * mirroring the orientation provenance pattern:
   *
   *   - 'SDSS petroR50_r' — Petrosian half-light radius × 3 → physical kpc
   *   - '2MRS Riso'       — log10 isophotal radius → diameter → physical kpc
   *   - 'GLADE Tully'     — Tully (1988) size–luminosity from absolute B mag
   *   - 'fallback (30 kpc)' — no parser-supplied measurement; built-in default
   *
   * Computed at info-card-build time from the authoritative persisted
   * `cloud.diameterIsFallback[idx]` flag (via `GalaxyRow.diameterIsFallback`)
   * and, where applicable, the source catalog — not by comparing
   * `cloud.diameterKpc[idx]` to DEFAULT_GALAXY_DIAMETER_KPC, which would
   * mislabel a genuinely measured 30 kpc galaxy as fallback.
   */
  diameterProvenance: string;

  /**
   * Famous-galaxy enrichment block, present only when `source === Source.FamousGalaxy`.
   *
   * Populated by `buildGalaxyInfo` from the `famous_galaxies_meta.json` sidecar loaded
   * at engine startup.  Absent (`undefined`) for SDSS / 2MRS / GLADE / Synthetic
   * rows — those never have curated metadata.
   */
  famous?: {
    /** Stable machine-readable id, e.g. `"m31"`. Matches the WebP filename. */
    id: string;
    /**
     * Curated human-friendly display name when one is set on the seed entry
     * (e.g. `"Andromeda Galaxy"` for M31).  When present, both the InfoCard
     * headline and the structure label prefer this over `names[0]`; the rest of
     * `names` appears as "Also known as" aliases.  Absent for most entries —
     * the seed only sets commonName for galaxies whose widely-recognised
     * name differs meaningfully from the catalog identifier.
     */
    commonName?: string;
    /** Catalog aliases in seed order, e.g. `["M31", "NGC 224"]`. */
    names: string[];
    /** One-paragraph descriptive text for the InfoCard. */
    description: string;
    /** Morphological / physical type, e.g. `"SBb"`. */
    type: string;
  };

  /** @group Orientation */

  /**
   * Orientation provenance + values for the InfoCard "Orientation" row.
   *
   * `axisRatio` and `positionAngleDeg` mirror the cloud's per-galaxy
   * fields (always finite — fallback-filled at build time). `provenance`
   * is a human-readable tag derived at info-card-build time by comparing
   * the cloud value to what `fallbackOrientation` would produce for this
   * row's (objID, ra, dec):
   *
   *   - exact match → 'deterministic fallback'
   *   - SDSS row, mismatch → 'SDSS exp+deV blend'
   *   - 2MRS row, mismatch → '2MASS XSC sup_phi'
   *   - GLADE row, mismatch → 'HyperLEDA PGC'
   *   - Synthetic row → 'deterministic fallback' (synthetic skips real-data fetch)
   */
  orientation: {
    axisRatio: number;
    positionAngleDeg: number;
    provenance: string;
  };

  /**
   * Image cutout URL for this galaxy's thumbnail.
   *
   * Famous galaxies use their curated, non-deprojected tile at
   * `/images/famous-thumb/<id>.webp`.  Galaxy catalog rows use a sky cutout sized to
   * the galaxy's angular extent: SDSS DR18 ImgCutout for SDSS-sourced rows,
   * and the all-sky DSS colour composite via `dssThumbnailUrl` for 2MRS /
   * GLADE / Synthetic (SDSS only covers ~1/3 of the sky).
   */
  thumbnailUrl: string;

  /**
   * Fallback cutout URL, shown if `thumbnailUrl` fails to load.  Set only for
   * famous galaxies — the galaxy catalog sky cutout, used when a curated tile is
   * absent (e.g. a source that couldn't be re-fetched for the thumb backfill).
   * Absent for galaxy catalog rows, whose `thumbnailUrl` is already the cutout.
   */
  thumbnailFallbackUrl?: string;

  /** External 2D sky viewer URL, framed to match the thumbnail's field of view. */
  skyViewUrl?: string;
};
