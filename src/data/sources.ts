/**
 * `Source` enum + `SOURCE_REGISTRY`.
 *
 * Source identity: the numeric source codes baked into the `.bin` catalog
 * format and the per-source metadata used by the loader / UI / camera
 * (discriminated `'survey' | 'poi'` rows). The visibility-bitmask helpers
 * live in `utils/sourceMask`.
 */

import type { BandLabels } from '../@types/data/BandLabels';
import type { SourceEntry } from '../@types/data/SourceEntry';
import type { SurveySource } from '../@types/data/SurveySource';
import type { PoiSource } from '../@types/data/PoiSource';

// ─── The enum itself ────────────────────────────────────────────────────────

/**
 * Stable numeric tag identifying which survey a galaxy was observed by.
 *
 * IMPORTANT: these integer values are persisted in the `.bin` point-cloud
 * file format. Treat them like API version numbers — append, never
 * renumber. Recycling a code silently breaks every `.bin` ever written.
 */
export const Source = {
  /** Procedurally-generated stand-in cloud (no real photometry). */
  Synthetic: 0,
  /** Sloan Digital Sky Survey — deep optical spectroscopic survey. */
  SDSS: 1,
  /** 2MASS Redshift Survey — near-IR all-sky redshift catalog. */
  TwoMRS: 2,
  /**
   * Galaxy List for the Advanced Detector Era (GLADE v2.3) — an all-sky
   * compilation that pre-merges HyperLEDA, GWGC, 2MASS XSC, 2MPZ, 6dFGS,
   * and SDSS-DR12Q with cross-match dedup. Acts as the "deep all-sky"
   * baseline so the merger doesn't have to re-dedup those parent catalogs.
   */
  Glade: 3,
  /**
   * Curated atlas of well-known galaxies (Messier + NGC greatest-hits).
   * Distinct from survey-derived sources because entries are hand-picked,
   * carry curated descriptions, and ship with high-quality processed
   * thumbnails. Many entries (M31, M33, M81, NGC 253) sit too close to
   * survive 2MRS/GLADE's small-z filtering, so they need their own
   * positions rather than just tagging existing rows.
   */
  Famous: 4,
  /**
   * Galaxy-cluster anchors (Virgo, Coma, Norma, ...). Picks against a
   * cluster's marker ring return source code 5 in the upper 5 bits of
   * the packed identity; the 27-bit `localIdx` carries the POI's index
   * into the cluster table. See `selectionEncoding.ts` for the layout
   * and `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md`
   * §6.2 for the per-category allocation rationale.
   */
  Cluster: 5,
  /** Supercluster anchors (Hydra Wall, Hercules SC, ...). Same encoding as Cluster. */
  Supercluster: 6,
  /** Void anchors (Sculptor Void, Local Void, Boötes Void). Same encoding as Cluster. */
  Void: 7,
  /**
   * Milliquas v8 (Flesch 2023) — the Million Quasars compilation. AGN
   * point sources (QSOs, BL Lacs, type-1 Seyferts, Seyfert-1 cores,
   * candidate quasars) rendered alongside the galaxy surveys for the
   * optically-bright AGN sky. Slot 8 — slots 5/6/7 belong to the POI
   * codes above, so the next survey integer is 8.
   */
  Milliquas: 8,
} as const;
export type Source = (typeof Source)[keyof typeof Source];

export type { SurveySource, PoiSource };

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Per-source metadata, keyed by every `Source`. Discriminated by `type`;
 * see the `SurveyEntry` / `PoiEntry` definitions for the field shapes.
 *
 * `as const satisfies Readonly<Record<Source, SourceEntry>>` preserves each
 * entry's literal `type`, so `SOURCE_REGISTRY[Source.SDSS]` narrows to
 * `SurveyEntry` at use sites without manual casts.
 *
 * Convention notes that aren't expressed by the types:
 *
 * - **`label`** follows survey-team capitalisation (`'2MRS'` no space,
 *   `'GLADE'` uppercase). Match these in any new UI strings.
 * - **`binBaseName`** is `null` only for runtime-generated sources
 *   (currently just Synthetic). Tier-aware filenames are assembled in
 *   `tierFilenameForSource`.
 * - **`maxDistMpc`** is a *display* limit (camera framing), not a strict
 *   cut. Conversion uses `H₀ ≈ 70 km/s/Mpc`; outliers may sit beyond.
 * - **`bandLabels`** records the actual band each `magU/G/R/I/Z` slot
 *   carries. Catalog parsers shoehorn non-SDSS bands into the 5-slot
 *   layout, so labelling rows "(g)" for a 2MRS galaxy would be misleading.
 *   `'—'` (em-dash) marks an empty slot.
 */
export const SOURCE_REGISTRY = {
  [Source.Synthetic]: {
    type: 'survey',
    code: Source.Synthetic,
    label: 'Synthetic',
    binBaseName: null, // generated at runtime; no file
    allSky: true, // uniform-in-sphere by construction
    maxDistMpc: 1000, // matches the radius in synthetic.ts
    bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  },
  [Source.SDSS]: {
    type: 'survey',
    code: Source.SDSS,
    label: 'SDSS',
    binBaseName: 'sdss',
    allSky: false,
    // Main galaxy sample reaches z ~ 0.7+ for luminous red galaxies;
    // rounded up generously.
    maxDistMpc: 3000,
    bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  },
  [Source.TwoMRS]: {
    type: 'survey',
    code: Source.TwoMRS,
    label: '2MRS',
    binBaseName: '2mrs',
    allSky: true,
    // Flux-limited at K_s ≈ 11.75; effective z ≲ 0.06.
    maxDistMpc: 250,
    bandLabels: { u: '—', g: 'J', r: 'H', i: 'K', z: '—' },
  },
  [Source.Glade]: {
    type: 'survey',
    code: Source.Glade,
    label: 'GLADE',
    binBaseName: 'glade',
    allSky: true,
    // Covers most of the GLADE distance distribution. GLADE has a long
    // sparse tail past 1 Gpc that the default framing deliberately clips.
    maxDistMpc: 1500,
    bandLabels: { u: '—', g: 'B', r: 'J', i: 'H', z: 'K' },
  },
  [Source.Famous]: {
    type: 'survey',
    code: Source.Famous,
    label: 'Famous',
    binBaseName: 'famous',
    allSky: true, // hand-picked entries from across the sky
    maxDistMpc: 200, // covers the curated set: M31 → NGC 4889
    // Famous entries don't carry per-row photometry — the source survey
    // already measured it. The SDSS-mirroring labels are cosmetic so the
    // InfoCard renders generic "(g)" tags without a new branch; the
    // stored mag values are NaN, which FullCard renders as "N/A".
    bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  },
  [Source.Cluster]: { type: 'poi', code: Source.Cluster, label: 'Cluster', allSky: true },
  [Source.Supercluster]: { type: 'poi', code: Source.Supercluster, label: 'Supercluster', allSky: true },
  [Source.Void]: { type: 'poi', code: Source.Void, label: 'Void', allSky: true },
  [Source.Milliquas]: {
    type: 'survey',
    code: Source.Milliquas,
    label: 'Milliquas',
    binBaseName: 'milliquas',
    allSky: true,
    // Milliquas reaches z ~ 7 (quasars at the edge of the observable
    // universe). Hubble's law with z = 7 ⇒ ~25 Gpc, but the bulk of
    // Milliquas is at z < 3 (~12 Gpc). While the renderer uses the
    // linear-Hubble approximation, this is a *display* limit generous
    // enough to keep the bright low-z tail framed comfortably.
    maxDistMpc: 4000,
    // Milliquas carries two optical-band magnitudes only: Rmag (red, ~R)
    // and Bmag (blue, ~B). Bmag goes into the magG slot (closest
    // wavelength to SDSS g among the empty slots) and Rmag into magR.
    bandLabels: { u: '—', g: 'B', r: 'R', i: '—', z: '—' },
  },
} as const satisfies Readonly<Record<Source, SourceEntry>>;

// ─── Public lookup functions ────────────────────────────────────────────────

/**
 * Photometric band labels for the five `magU/G/R/I/Z` slots on this source's
 * `GalaxyCatalog`. Returns the actual band carried in each slot (e.g. `'B'`
 * for GLADE's g-slot) so the InfoCard can label rows accurately instead of
 * always saying "(g)". Empty slots carry `'—'`.
 */
export function bandLabels(source: Source): BandLabels {
  const entry = SOURCE_REGISTRY[source];
  // POI markers have no photometry. Reaching here with a POI means the
  // InfoCard is rendering a galaxy row for a non-galaxy entity.
  if (entry.type === 'poi') {
    throw new Error(`bandLabels: POI source ${source} has no photometric bands`);
  }
  return entry.bandLabels;
}

// ─── Iteration order ────────────────────────────────────────────────────────

/**
 * Survey sources in UI presentation order — smallest catalogue → largest
 * (Famous → 2MRS → SDSS → GLADE, ~20 → 38 k → 500 k → 2 M rows). Synthetic
 * leads as the procedural-fallback cloud, hidden from user-facing lists.
 *
 * Listed explicitly rather than `Object.values(Source)` so adding a source
 * to the file-format enum doesn't silently promote it into the UI and the
 * visibility bitmask.
 */
export const SURVEY_SOURCES: readonly Source[] = [
  Source.Synthetic,
  Source.Famous,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
];
