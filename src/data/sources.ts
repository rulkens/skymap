/**
 * Source enum + per-survey metadata + bitmask helpers.
 *
 * This module is the single source of truth for "which astronomical survey
 * does this point come from?" The renderer, the binary loader, and the UI
 * controls all import from here, so changing a value in this file ripples
 * through every layer of the pipeline. That's deliberate — by funnelling
 * survey identity through one tiny module, we get a compile-time check that
 * everyone agrees on the integer codes used on disk.
 *
 * ---
 * ### Why a numeric enum (not a string union)?
 *
 * Each point in our binary `.bin` cloud format carries a 1-byte `source`
 * tag (see `pointCloudFormat.ts`). A string like `'SDSS'` would cost 4
 * bytes per point — for 10 million points that's 40 MB of redundant text.
 * A `u8` is one byte and lets the GPU compute shader test
 * `sourceMask & (1u << src)` to filter visibility per-frame at zero cost.
 *
 * The numeric values below are therefore part of the *on-disk file format*.
 * Renaming a member is fine; *renumbering* it would silently break every
 * `.bin` file ever written. If you ever need to deprecate a source, mark
 * it as obsolete and append a new one — never recycle the integer.
 *
 * ---
 * ### Why a bitmask (not a `Set<Source>`)?
 *
 * The renderer needs to ask "is source X currently visible?" for *every
 * point, every frame*. With ~10 million points at 60 fps that's 600 million
 * lookups per second. A 32-bit integer mask answers that question in one
 * `AND` and one compare; a JS `Set` would allocate and dereference, which
 * is unthinkable inside a render loop and isn't even possible inside a
 * WGSL shader.
 *
 * 32 bits gives us 32 possible sources — vastly more than the four we
 * currently track, with comfortable headroom for future catalogs (DESI,
 * Euclid, LSST...).
 *
 * ---
 * ### rev-2 transition note (2026-05-03)
 *
 * Earlier drafts of this module enumerated **2MPZ** (slot 3) and **6dFGS**
 * (slot 4) as separate sources. Both were dropped in favour of **GLADE**
 * (Galaxy List for the Advanced Detector Era, v2.3) because GLADE already
 * pre-merges them along with HyperLEDA, GWGC, 2MASS XSC, and SDSS-DR12Q,
 * with cross-match deduplication done by the GLADE team. Loading those
 * catalogs separately would mean re-doing the dedup work ourselves and
 * carrying double-counted galaxies until we did. Collapsing to a single
 * all-sky GLADE source keeps the rendering architecture simpler and the
 * data more correct out of the box.
 *
 * Note that we did **not** recycle integer codes 3 and 4 from the dropped
 * surveys: GLADE took slot 3, and slot 4 is reserved for the next survey.
 * No production `.bin` files were ever shipped with the old codes, so the
 * renumber is safe — but the rule "never recycle a code" still applies
 * for any future change.
 */

// ─── The enum itself ────────────────────────────────────────────────────────

/**
 * Stable numeric tag identifying which survey a galaxy was observed by.
 *
 * IMPORTANT: these integer values are persisted in the `.bin` point-cloud
 * file format. Treat them like API version numbers — append, never
 * renumber. See module docstring for the full rationale.
 */
export enum Source {
  /** Procedurally-generated stand-in cloud (no real photometry). */
  Synthetic = 0,
  /** Sloan Digital Sky Survey — deep optical spectroscopic survey. */
  SDSS = 1,
  /** 2MASS Redshift Survey — near-IR all-sky redshift catalog. */
  TwoMRS = 2,
  /**
   * Galaxy List for the Advanced Detector Era (GLADE v2.3) — an all-sky
   * compilation that pre-merges HyperLEDA, GWGC, 2MASS XSC, 2MPZ, 6dFGS,
   * and SDSS-DR12Q with cross-match dedup. Acts as our "deep all-sky"
   * baseline so we don't have to re-merge those parent catalogs ourselves.
   */
  Glade = 3,
  /**
   * Curated atlas of well-known galaxies (Messier + NGC greatest-hits).
   * Distinct from the survey-derived sources because entries are
   * hand-picked + carry curated descriptions and high-quality processed
   * thumbnails.  Many entries (M31, M33, M81, NGC 253) sit too close to
   * us to survive 2MRS/GLADE's small-z filtering, so they need their own
   * positions rather than just tagging existing rows.
   */
  Famous = 4,
}

// ─── Per-survey metadata tables ─────────────────────────────────────────────
//
// We keep the metadata in plain object literals keyed by enum value rather
// than scattering it across a class hierarchy. The lookup functions below
// give the public API; the tables themselves stay private to this module.
//
// Why three flat tables instead of one `SourceInfo` record? Each access
// pattern is independent — the loader cares about disk codes, the camera
// cares about distances, the UI cares about labels — so colocating them
// would just create false coupling. Splitting them also keeps tree-shaking
// happy if a downstream module only needs one slice.

/**
 * Human-readable display name for each survey.
 *
 * These strings appear in the UI legend and tooltips. They follow the
 * conventions used by the survey teams themselves: `2MRS` (no space),
 * `GLADE` (uppercase, matching the published catalog name), etc. — match
 * these conventions in any new UI strings.
 */
const LABELS: Record<Source, string> = {
  [Source.Synthetic]: 'Synthetic',
  [Source.SDSS]: 'SDSS',
  [Source.TwoMRS]: '2MRS',
  [Source.Glade]: 'GLADE',
  [Source.Famous]: 'Famous',
};

/**
 * Whether a survey covers (approximately) the *entire* celestial sphere,
 * versus only a wedge or hemisphere of it.
 *
 * - **2MRS** is deliberately all-sky: its parent 2MASS imaging survey
 *   scanned the whole sky from two telescopes (one per hemisphere).
 * - **GLADE** is full-sky by construction — it merges several all-sky
 *   parent catalogs (HyperLEDA, 2MASS XSC, GWGC, 2MPZ, 6dFGS, SDSS-DR12Q),
 *   so any gaps in one are filled by another.
 * - **SDSS** focuses on the northern Galactic cap plus three southern
 *   stripes — about a third of the sky. Rendering it as "all-sky" would
 *   misrepresent the data.
 *
 * The renderer uses this flag to decide whether to draw a coverage mask
 * overlay or skip it.
 */
const ALL_SKY: Record<Source, boolean> = {
  [Source.Synthetic]: true, // synthetic cloud is uniform-in-sphere by construction
  [Source.SDSS]: false,
  [Source.TwoMRS]: true,
  [Source.Glade]: true,
  [Source.Famous]: true, // hand-picked entries from across the sky
};

/**
 * Approximate effective maximum distance per survey, in megaparsecs.
 *
 * These are *display* limits — they tell the camera how far to zoom out so
 * the user sees the whole catalog without leaving most of the volume empty.
 * They are not strict cuts (a few outliers may sit beyond), and they are
 * intentionally a little generous (rounded up) to keep the edge of the
 * cloud comfortably inside the view frustum.
 *
 * Sources for the numbers (rough, redshift → distance via Hubble's law,
 * H₀ ≈ 70 km/s/Mpc):
 * - **2MRS** ≈ 250 Mpc — flux-limited at K_s ≈ 11.75; effective z ≲ 0.06.
 * - **GLADE** ≈ 1500 Mpc — covers most of the GLADE distance distribution;
 *                          GLADE has a long sparse tail past 1 Gpc that we
 *                          deliberately clip out of the default framing.
 * - **SDSS**  ≈ 3000 Mpc — main galaxy sample reaches z ~ 0.7+ for
 *                          luminous red galaxies; we round up generously.
 * - **Synthetic** = 1000 Mpc — matches the radius hard-coded in
 *                              `synthetic.ts`.
 */
const MAX_DIST_MPC: Record<Source, number> = {
  [Source.Synthetic]: 1000,
  [Source.SDSS]: 3000,
  [Source.TwoMRS]: 250,
  [Source.Glade]: 1500,
  [Source.Famous]: 200, // covers the curated set: M31 → NGC 4889
};

/**
 * The actual photometric bands stored in each per-cloud `magU/G/R/I/Z` slot,
 * keyed by the slot name.  Catalog parsers shoehorn whichever bands the source
 * provides into the SDSS-style 5-slot layout, but the data is *not* always
 * SDSS u/g/r/i/z — labelling rows "(g)" in the InfoCard would be misleading
 * for non-SDSS sources.
 *
 * Slot ↔ band mapping per source (see parsers/twoMrs.ts and parsers/glade.ts):
 *
 *   SDSS:       u → u, g → g,  r → r, i → i, z → z          (real SDSS bands)
 *   2MRS:       u → —, g → J,  r → H, i → K, z → —          (2MASS NIR triplet)
 *   GLADE:      u → —, g → B,  r → J, i → H, z → K          (B + 2MASS JHK)
 *   Synthetic:  u → u, g → g,  r → r, i → i, z → z          (modelled on SDSS)
 *
 * `'—'` (em-dash) is used for empty slots so the InfoCard can detect absent
 * bands without resorting to special string values like 'N/A' or empty
 * strings — and so the display falls back gracefully if accidentally rendered.
 */
const BAND_LABELS: Record<Source, BandLabels> = {
  [Source.Synthetic]: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  [Source.SDSS]: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  [Source.TwoMRS]: { u: '—', g: 'J', r: 'H', i: 'K', z: '—' },
  [Source.Glade]: { u: '—', g: 'B', r: 'J', i: 'H', z: 'K' },
  // Famous entries don't carry per-row photometry (we don't repeat what
  // the source survey already measured).  Mirror the SDSS labels purely
  // so the InfoCard markup renders generic "(g)" tags without a new
  // branch — the actual mag values stored on the cloud are NaN, which
  // FullCard already gracefully renders as "N/A".
  [Source.Famous]: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
};

/**
 * The band-label record returned by `bandLabels()`.  Kept as a named export
 * so InfoCard prop types can refer to it directly without needing to spell
 * out the structure at every call site.
 */
export type BandLabels = {
  u: string;
  g: string;
  r: string;
  i: string;
  z: string;
};

// ─── Public lookup functions ────────────────────────────────────────────────
//
// These thin wrappers exist so that callers depend on a *function signature*
// rather than the shape of an internal table. If we ever want to load
// metadata from a config file or compute it dynamically, we can change the
// implementation without breaking imports.

/** Display name (e.g. `'2MRS'`, `'GLADE'`) for a given source. */
export function sourceLabel(source: Source): string {
  return LABELS[source];
}

/** True if the survey covers (approximately) the full celestial sphere. */
export function sourceIsAllSky(source: Source): boolean {
  return ALL_SKY[source];
}

/** Approximate effective max distance in megaparsecs. See `MAX_DIST_MPC`. */
export function sourceMaxDistanceMpc(source: Source): number {
  return MAX_DIST_MPC[source];
}

/**
 * Photometric band labels for the five `magU/G/R/I/Z` slots on this source's
 * `PointCloud`.  Returns the actual band name carried in each slot (e.g.
 * `'B'` for GLADE's g-slot) so the InfoCard can label rows accurately
 * instead of always saying "(g)".  Slots without a measurement carry `'—'`.
 *
 * See the `BAND_LABELS` table above for the per-source mapping rationale.
 */
export function bandLabels(source: Source): BandLabels {
  return BAND_LABELS[source];
}

// ─── Visibility bitmask ─────────────────────────────────────────────────────

/**
 * The list of all currently-defined sources, used to build `ALL_VISIBLE_MASK`
 * and to iterate over surveys when rendering UI controls.
 *
 * We list them explicitly rather than `Object.values(Source).filter(...)`
 * because TS numeric enums produce a *reverse mapping* at runtime
 * (`{ 0: 'Synthetic', Synthetic: 0, ... }`), so naive iteration yields
 * twice as many keys as you expect. Hard-coding the list also makes the
 * intent obvious and the file format change visible in code review.
 */
// Ordering: real surveys are listed smallest catalogue → largest, so the
// UI presents them in an intuitive "tip-of-the-iceberg first" order
// (Famous → 2MRS → SDSS → GLADE, roughly 20 → 38 k → 500 k → 2 M rows).
// Synthetic stays first as a special case — it's the procedural-fallback
// cloud, not a real survey, and is hidden from user-facing lists anyway.
export const ALL_SOURCES: readonly Source[] = [
  Source.Synthetic,
  Source.Famous,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
];

/**
 * Bitmask with a `1` in every defined source's bit position — i.e. "show
 * everything". This is the renderer's default visibility mask on startup.
 *
 * Computed as `(1<<0) | (1<<1) | (1<<2) | (1<<3) | (1<<4) = 0b11111 = 31`.
 *
 * Note we use `<<` (not `**`) because it's an integer operation and runs
 * the same way in JS, WGSL, and TS. JS bitwise ops coerce to 32-bit
 * signed ints, which is fine — we have 32 bits to spare.
 */
export const ALL_VISIBLE_MASK: number = ALL_SOURCES.reduce((mask, src) => mask | (1 << src), 0);

/** True if `mask` has the bit for `source` set. */
export function maskHas(mask: number, source: Source): boolean {
  // `& (1 << source)` isolates the bit; coerce non-zero to true.
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
