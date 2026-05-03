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
 * 32 bits gives us 32 possible sources — vastly more than the five we
 * currently track, with comfortable headroom for future catalogs (DESI,
 * Euclid, LSST...).
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
  /** 2MASS Photometric Redshift Catalogue — photo-z all-sky catalog. */
  TwoMPZ = 3,
  /** 6dF Galaxy Survey — southern-hemisphere redshift survey. */
  SixDFGS = 4,
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
 * `6dFGS` (lowercase `d`), etc. — match these in any new UI strings.
 */
const LABELS: Record<Source, string> = {
  [Source.Synthetic]: 'Synthetic',
  [Source.SDSS]: 'SDSS',
  [Source.TwoMRS]: '2MRS',
  [Source.TwoMPZ]: '2MPZ',
  [Source.SixDFGS]: '6dFGS',
};

/**
 * Whether a survey covers (approximately) the *entire* celestial sphere,
 * versus only a wedge or hemisphere of it.
 *
 * - **2MRS / 2MPZ** are deliberately all-sky: their parent 2MASS imaging
 *   survey scanned the whole sky from two telescopes (one per hemisphere).
 * - **SDSS** focuses on the northern Galactic cap plus three southern
 *   stripes — about a third of the sky. Rendering it as "all-sky" would
 *   misrepresent the data.
 * - **6dFGS** is southern-hemisphere only (declination ≲ 0°).
 *
 * The renderer uses this flag to decide whether to draw a coverage mask
 * overlay or skip it.
 */
const ALL_SKY: Record<Source, boolean> = {
  [Source.Synthetic]: true, // synthetic cloud is uniform-in-sphere by construction
  [Source.SDSS]: false,
  [Source.TwoMRS]: true,
  [Source.TwoMPZ]: true,
  [Source.SixDFGS]: false,
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
 * - **2MPZ** ≈ 600 Mpc — photo-z catalog, deeper than 2MRS; z ≲ 0.15.
 * - **6dFGS** ≈ 700 Mpc — z ≲ 0.17 spectroscopic depth.
 * - **SDSS**  ≈ 3000 Mpc — main galaxy sample reaches z ~ 0.7+ for
 *                          luminous red galaxies; we round up generously.
 * - **Synthetic** = 1000 Mpc — matches the radius hard-coded in
 *                              `synthetic.ts`.
 */
const MAX_DIST_MPC: Record<Source, number> = {
  [Source.Synthetic]: 1000,
  [Source.SDSS]: 3000,
  [Source.TwoMRS]: 250,
  [Source.TwoMPZ]: 600,
  [Source.SixDFGS]: 700,
};

// ─── Public lookup functions ────────────────────────────────────────────────
//
// These thin wrappers exist so that callers depend on a *function signature*
// rather than the shape of an internal table. If we ever want to load
// metadata from a config file or compute it dynamically, we can change the
// implementation without breaking imports.

/** Display name (e.g. `'2MRS'`, `'6dFGS'`) for a given source. */
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
export const ALL_SOURCES: readonly Source[] = [
  Source.Synthetic,
  Source.SDSS,
  Source.TwoMRS,
  Source.TwoMPZ,
  Source.SixDFGS,
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
