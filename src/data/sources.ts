/**
 * Source enum + per-survey registry + bitmask helpers.
 *
 * The single source of truth for "which astronomical survey does this point
 * come from?" The renderer, the binary loader, and the UI controls all import
 * from here, so changing a value in this file ripples through every layer of
 * the pipeline. That's deliberate — funnelling survey identity through one
 * tiny module gives a compile-time check that everyone agrees on the integer
 * codes used on disk.
 *
 * ---
 * ### Why a numeric enum (not a string union)?
 *
 * Each point in the binary `.bin` catalog format carries a 1-byte `source`
 * tag (see `galaxyCatalogFormat.ts`). A string like `'SDSS'` would cost 4
 * bytes per point — for 10 million points that's 40 MB of redundant text.
 * A `u8` is one byte and lets the GPU compute shader test
 * `sourceMask & (1u << src)` to filter visibility per-frame at zero cost.
 *
 * The numeric values below are part of the *on-disk file format*. Renaming
 * a member is fine; *renumbering* it would silently break every `.bin` file
 * ever written. To deprecate a source, mark it obsolete and append a new
 * one — never recycle the integer.
 *
 * ---
 * ### Why a bitmask (not a `Set<Source>`)?
 *
 * The renderer asks "is source X currently visible?" for every point, every
 * frame. At ~10 million points × 60 fps that's 600 M lookups per second.
 * A 32-bit integer mask answers that in one `AND` and one compare; a JS
 * `Set` would allocate and dereference, which is unthinkable inside a render
 * loop and impossible inside a WGSL shader. 32 bits gives 32 possible
 * sources — vastly more than the four currently tracked, with headroom for
 * future catalogs (DESI, Euclid, LSST...).
 *
 * ---
 * ### Why one registry discriminated by `type`?
 *
 * Per-source metadata (display label, sky coverage, camera depth, band
 * layout, on-disk filename) lives in `SOURCE_REGISTRY` so adding a new
 * source means editing one entry rather than several parallel tables that
 * have to stay in lock-step. Surveys and POI codes (Cluster, Supercluster,
 * Void) carry different field sets — POIs have no `.bin` file, no
 * photometric bands, no survey depth — so each entry is discriminated by a
 * `type: 'survey' | 'poi'` field. A discriminated union keeps every field
 * on a survey entry required (no optionals scattered across the type) while
 * still letting one registry hold both kinds. Accessors that only make
 * sense for surveys narrow on `entry.type === 'poi'` and throw.
 */

import type { BandLabels } from '../@types/data/BandLabels';
import type { SurveyEntry } from '../@types/data/SurveyEntry';
import type { PoiEntry } from '../@types/data/PoiEntry';
import type { SourceEntry } from '../@types/data/SourceEntry';

// ─── The enum itself ────────────────────────────────────────────────────────

/**
 * Stable numeric tag identifying which survey a galaxy was observed by.
 *
 * IMPORTANT: these integer values are persisted in the `.bin` point-cloud
 * file format. Treat them like API version numbers — append, never
 * renumber. See module docstring for the full rationale.
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
   * POI-only — used for pick encoding, no `.bin` representation, excluded
   * from `ALL_SOURCES`.
   *
   * Galaxy-cluster anchors (Virgo, Coma, Norma, ...). Picks against a
   * cluster's marker ring return source code 5 in the upper 5 bits of
   * the packed identity; the 27-bit `localIdx` carries the POI's index
   * into the cluster table. See `selectionEncoding.ts` for the layout
   * and `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md`
   * §6.2 for the per-category allocation rationale.
   */
  Cluster: 5,
  /**
   * POI-only — used for pick encoding, no `.bin` representation, excluded
   * from `ALL_SOURCES`.
   *
   * Supercluster anchors (Hydra Wall, Hercules SC, ...). Same encoding
   * scheme as Cluster, distinct source code so the pick result is
   * self-describing without an extra category lookup.
   */
  Supercluster: 6,
  /**
   * POI-only — used for pick encoding, no `.bin` representation, excluded
   * from `ALL_SOURCES`.
   *
   * Void anchors (Sculptor Void, Local Void, Boötes Void). Same encoding
   * scheme as Cluster / Supercluster.
   */
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

/**
 * Survey sources — the ones with `.bin` representations that participate in
 * the points pipeline. Excludes the POI codes which have no per-survey
 * metadata to look up.
 */
export type SurveySource = Exclude<
  Source,
  typeof Source.Cluster | typeof Source.Supercluster | typeof Source.Void
>;

/** POI sources — pick-encoding-only codes for cluster/supercluster/void markers. */
export type PoiSource =
  | typeof Source.Cluster
  | typeof Source.Supercluster
  | typeof Source.Void;

export type { SurveyEntry, PoiEntry, SourceEntry };

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Per-source metadata, keyed by every `Source` (surveys + POIs). Each entry
 * is discriminated by `type`:
 *
 *   - `'survey'` entries carry the full per-survey kit: filename stem,
 *     sky-coverage flag, camera depth, band layout. `binBaseName` is `null`
 *     for the synthetic cloud (generated at runtime, no `.bin` file);
 *     every other survey field is required.
 *   - `'poi'` entries carry just code + label. POIs don't have a `.bin`
 *     file, photometric bands, or a survey depth, so the entry is tiny.
 *
 * `as const satisfies Readonly<Record<Source, SourceEntry>>` preserves each
 * entry's literal `type`, so `SOURCE_REGISTRY[Source.SDSS]` narrows to
 * `SurveyEntry` at use sites without manual casts.
 *
 * ### Survey field reference
 *
 * - **`label`** — UI display name. Follows survey-team conventions: `'2MRS'`
 *   no space, `'GLADE'` uppercase, etc. Match these in any new UI strings.
 *
 * - **`binBaseName`** — filename stem under `public/data/`. Tier-aware
 *   sources (SDSS, GLADE, Milliquas) get `-<tier>` appended by
 *   `tierFilenameForSource` in `tierTargets.ts`; tier-agnostic sources
 *   (2MRS, Famous) load the bare `<base>.bin`. Synthetic is `null`.
 *
 * - **`allSky`** — drives whether the renderer draws a coverage-mask
 *   overlay. 2MRS, GLADE, Famous, and Milliquas are all-sky by
 *   construction; SDSS covers ~⅓ of the sky (NGC + three southern stripes)
 *   and would be misrepresented by an all-sky badge.
 *
 * - **`maxDistMpc`** — *display* limit for camera framing, in megaparsecs,
 *   redshift → distance via `H₀ ≈ 70 km/s/Mpc`. Not a strict cut. Rounded
 *   up to keep the edge of the cloud comfortably inside the view frustum.
 *
 * - **`bandLabels`** — the actual photometric band carried in each
 *   `magU/G/R/I/Z` slot. Catalog parsers shoehorn whichever bands the
 *   source provides into the SDSS-shaped 5-slot layout, so the data is
 *   *not* always SDSS u/g/r/i/z — labelling rows "(g)" for non-SDSS
 *   sources would be misleading. `'—'` (em-dash) marks an empty slot.
 *
 *       SDSS:       u → u, g → g,  r → r, i → i, z → z   (real SDSS bands)
 *       2MRS:       u → —, g → J,  r → H, i → K, z → —   (2MASS NIR triplet)
 *       GLADE:      u → —, g → B,  r → J, i → H, z → K   (B + 2MASS JHK)
 *       Synthetic:  u → u, g → g,  r → r, i → i, z → z   (modelled on SDSS)
 *       Famous:     u → u, g → g,  r → r, i → i, z → z   (no per-row photometry; cosmetic)
 *       Milliquas:  u → —, g → B,  r → R, i → —, z → —   (Bmag, Rmag only)
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
  [Source.Cluster]: { type: 'poi', code: Source.Cluster, label: 'Cluster' },
  [Source.Supercluster]: { type: 'poi', code: Source.Supercluster, label: 'Supercluster' },
  [Source.Void]: { type: 'poi', code: Source.Void, label: 'Void' },
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
//
// Thin wrappers around the registry so callers depend on a function
// signature rather than storage shape. Each accessor accepts the wider
// `Source` type and narrows or throws via the discriminator.

/** Display name (e.g. `'2MRS'`, `'GLADE'`, `'Cluster'`) for a given source. */
export function sourceLabel(source: Source): string {
  return SOURCE_REGISTRY[source].label;
}

/** True if the survey covers (approximately) the full celestial sphere. */
export function sourceIsAllSky(source: Source): boolean {
  const entry = SOURCE_REGISTRY[source];
  // POI anchors are full-sky in the trivial sense (individual points, not
  // survey footprints). Returning `true` keeps coverage-mask code paths
  // well-behaved if a POI somehow reaches them.
  if (entry.type === 'poi') return true;
  return entry.allSky;
}

/** Approximate effective max distance in megaparsecs. See `SOURCE_REGISTRY`. */
export function sourceMaxDistanceMpc(source: Source): number {
  const entry = SOURCE_REGISTRY[source];
  // POIs are not surveys and don't define a sample depth. Reaching here
  // with a POI means camera-framing code routed the wrong thing — fail
  // loudly instead of inventing a value.
  if (entry.type === 'poi') {
    throw new Error(`sourceMaxDistanceMpc: POI source ${source} has no survey depth`);
  }
  return entry.maxDistMpc;
}

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

// ─── Visibility bitmask ─────────────────────────────────────────────────────

/**
 * All currently-defined survey sources, used to build `ALL_VISIBLE_MASK` and
 * to iterate over surveys when rendering UI controls.
 *
 * Listed explicitly rather than `Object.values(Source)` to control the
 * iteration order — surveys are ordered smallest catalogue → largest, so
 * the UI presents them in an intuitive "tip-of-the-iceberg first" order
 * (Famous → 2MRS → SDSS → GLADE, roughly 20 → 38 k → 500 k → 2 M rows).
 * Synthetic stays first as the procedural-fallback cloud (not a real
 * survey, hidden from user-facing lists). Hard-coding the list also makes
 * any file-format-affecting change visible in code review.
 */
export const ALL_SOURCES: readonly Source[] = [
  Source.Synthetic,
  Source.Famous,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
];

/**
 * Bitmask with a `1` in every defined survey source's bit position — i.e.
 * "show everything". Computed as the union of all `1 << source` bits.
 *
 * Value: `(1<<0) | (1<<1) | (1<<2) | (1<<3) | (1<<4) | (1<<8) = 0b100011111
 * = 287`. Bits 5/6/7 stay clear because those slots are reserved for POI
 * codes that don't participate in the survey mask.
 *
 * The runtime's *startup* visibility mask is a separate constant in
 * `defaults.ts`.
 */
export const ALL_VISIBLE_MASK: number = ALL_SOURCES.reduce<number>(
  (mask, src) => mask | (1 << src),
  0,
);

/** True if `mask` has the bit for `source` set. */
export function maskHas(mask: number, source: Source): boolean {
  return (mask & (1 << source)) !== 0;
}

/** Returns a new mask with the bit for `source` set (idempotent). */
export function maskWith(mask: number, source: Source): number {
  return mask | (1 << source);
}

/** Returns a new mask with the bit for `source` cleared (idempotent). */
export function maskWithout(mask: number, source: Source): number {
  // `~(1 << source)` flips every bit *except* the one we want to clear,
  // so AND-ing leaves all other bits untouched while zeroing this one.
  return mask & ~(1 << source);
}
