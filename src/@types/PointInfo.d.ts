/**
 * PointInfo — display-ready data for a single galaxy, computed on-demand from
 * raw cloud arrays when the user hovers or selects a point. Passed from the
 * engine to React components via the onHoverChange / onSelectChange callbacks.
 */

import type { GalaxyTypeInfo } from './GalaxyTypeInfo';
import { Source, type BandLabels } from '../data/sources';

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
export type PointInfo = {
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
   * Carried on `PointInfo` so consumers like the camera-focus button can pivot
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
   * other data-derivation code in `pointInfoBuilder.ts`.
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
   * Survey-aware IAU designation, e.g. "SDSS J123456.75+012345.5",
   * "GLADE J234500.00-104500.5", "2MASX J...".  Built from RA/Dec via
   * `iauName(source, ra, dec)` so the prefix matches the row's actual
   * catalog and the user isn't lied to by an SDSS-shaped name on a
   * GLADE galaxy.
   */
  iauName: string;

  /**
   * The single best human-readable name for this row, suitable as a
   * headline in the InfoCard / hover preview.  Derived from a small
   * priority ladder:
   *
   *   1. Famous rows → primary curated name from the seed JSON
   *      (e.g. "M31", "NGC 5128").
   *   2. 2MRS or GLADE rows with a real PGC (objID > 0n) → `PGC <n>`.
   *      PGC numbers are widely indexed by NED / SIMBAD and are
   *      shorter and more memorable than a coord-based name.  For
   *      GLADE the PGC comes directly from the source row; for 2MRS
   *      it's populated by the build-time GLADE→2MRS cross-match.
   *   3. Everything else → `iauName` (the coord-based fallback).
   *
   * Pre-computed in the builder rather than left to each surface
   * (FullCard, CompactCard, command palette) so the headline stays
   * consistent across the UI without each component duplicating the
   * priority rules.
   */
  displayName: string;

  /** @group Source attribution */

  /**
   * Which survey this galaxy came from.  Drives the per-source UI badge and
   * decides whether SDSS-specific affordances (Explorer link, SDSS image
   * cutout) are shown for this point.
   */
  source: Source;

  /**
   * Display label for the source (e.g. "SDSS", "2MRS", "GLADE").  Pre-resolved
   * from `sourceLabel(source)` in the engine so the React layer never has to
   * import the survey-metadata table.
   */
  sourceLabel: string;

  /** @group External URLs */

  /**
   * URL of an external catalogue page for this object (opens in a new tab).
   *
   * Picked per-source so every real galaxy gets a useful link:
   *
   *   - SDSS rows with a valid objID → SDSS DR18 Quick Look (skyserver)
   *   - 2MRS rows → NED near-position search at the row's RA/Dec.  We
   *     deliberately don't use 2MASX byname here: NED's name index has
   *     coverage gaps for the 2MASX prefix (verified empirically), so a
   *     position search lands more reliably even when one extra click
   *     is required to drill into the object page.
   *   - GLADE rows with a real PGC → NED byname `PGC <n>` (the PGC is
   *     persisted in `objID` — see `tools/parsers/glade.ts`)
   *   - GLADE rows with no PGC → NED near-position search at the row's RA/Dec
   *   - Famous rows → NED byname using the primary curated name
   *     (M31, NGC 224, …) from the famous catalog sidecar
   *   - Synthetic rows → `null` (no real coords to look up)
   *
   * The InfoCard component picks an appropriate link label off `source`
   * (e.g. "View in SDSS Explorer" for SDSS, "View on NED" otherwise).
   */
  catalogUrl: string | null;

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
   * Computed at info-card-build time by comparing `cloud.diameterKpc[idx]`
   * to the project-wide DEFAULT_GALAXY_DIAMETER_KPC and (where applicable)
   * the source catalog.
   */
  diameterProvenance: string;

  /**
   * Famous-galaxy enrichment block, present only when `source === Source.Famous`.
   *
   * Populated by `pointInfoBuilder` from the `famous_meta.json` and
   * `famous_xrefs.json` sidecars loaded at engine startup.  Absent (`undefined`)
   * for SDSS / 2MRS / GLADE / Synthetic rows — those never have curated metadata.
   *
   * `xref` is the nearest cross-matched survey row (2MRS or GLADE) within
   * MATCH_THRESHOLD_ARCSEC, or `null` when no match was found.  Even a `null`
   * xref is useful in the UI — it tells the InfoCard "we checked and found nothing"
   * rather than "we haven't checked".
   */
  famous?: {
    /** Stable machine-readable id, e.g. `"m31"`. Matches the WebP filename. */
    id: string;
    /** Human-readable aliases in order of preference, e.g. `["M31", "Andromeda Galaxy"]`. */
    names: string[];
    /** One-paragraph descriptive text for the InfoCard. */
    description: string;
    /** Morphological / physical type, e.g. `"SBb"`. */
    type: string;
    /** Cross-match to the nearest 2MRS or GLADE row, or null if unmatched. */
    xref: {
      source: 'TwoMRS' | 'Glade';
      localIdx: number;
      distanceArcsec: number;
    } | null;
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
   * For SDSS-sourced galaxies this is the SDSS DR18 ImgCutout JPEG (200 px,
   * 0.4 arcsec/pixel).  For non-SDSS surveys (2MRS, GLADE, Synthetic) this
   * falls back to the all-sky DSS cutout service via `dssThumbnailUrl` —
   * SDSS only covers ~1/3 of the sky, so its cutout would return blank
   * frames for many of those positions.
   */
  thumbnailUrl: string;
};
