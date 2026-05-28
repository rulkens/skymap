/**
 * `Source` enum + `SOURCE_REGISTRY`.
 *
 * The single registry of every data source skymap loads. Four kinds,
 * discriminated by `type`:
 *
 *   'survey'   — per-point galaxy catalogs (SDSS, GLADE, 2MRS, Famous,
 *                Milliquas, Synthetic).  Codes are baked into the `.bin`
 *                point-cloud format and packed into the pick texture.
 *   'poi'      — galaxy-cluster / supercluster / void marker rings.
 *                Codes are also packed into the pick texture (upper 5 bits).
 *   'filament' — derived line-strip geometry (DisPerSE skeleton).
 *                Single global asset; no per-record identity.
 *   'volume'   — scalar-field cubes (CF-4 DM density, MCPM cosmic web).
 *                Each volume carries its own presentation defaults
 *                (palette, contrast, exposure, …).
 *
 * Only `'survey'` and `'poi'` codes are persisted to disk / packed into
 * GPU buffers; `'filament'` and `'volume'` codes exist solely so every
 * data source has one place to look. The visibility-bitmask helpers in
 * `utils/sourceMask` operate on survey codes only.
 */

import type { SourceEntry } from '../@types/data/SourceEntry';
import type { SourceType } from '../@types/data/SourceType';

// ─── The enum itself ────────────────────────────────────────────────────────

/**
 * Stable numeric tag for every data source. Used as a `.bin` byte for
 * survey rows, packed into the pick texture for survey + POI hits, and
 * as a registry key for filament + volume assets.
 *
 * IMPORTANT: integer values 0..8 are persisted in the `.bin` point-cloud
 * file format AND packed into the pick texture's upper 5 bits. Treat
 * them like API version numbers — append, never renumber. Recycling a
 * code silently breaks every `.bin` ever written and every saved
 * selection URL.
 *
 * Codes ≥ 9 (filaments, volumes) are not persisted anywhere, but the
 * same "append, never renumber" discipline applies for consistency.
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
  /**
   * Cosmic-web filament skeleton (DisPerSE on a 2MRS + GLADE density
   * field). Single global asset, not per-record; the registry entry
   * carries the default-enabled flag + intensity multiplier.
   */
  Filaments: 9,
  /**
   * Cosmicflows-4 dark-matter density volume (Valade 2024 HAMLET cube,
   * 256³). Default-off scalar field; the registry entry carries its
   * presentation defaults (palette, contrast, exposure, …).
   */
  Cf4Density: 10,
  /**
   * MCPM ("Cosmic Slime" / rhizome) cosmic-web density volume — SDSS DR17
   * VAC, tier-aware. Default-on scalar field; the registry entry carries
   * its presentation defaults.
   */
  Mcpm: 11,
  /**
   * DEV-only synthetic Gaussian-blob volume — verifies "is anything
   * visible at the cube origin?". Procedurally generated; no on-disk
   * payload. Bundled out of production builds via `import.meta.env.DEV`
   * gating at the slot-registration site.
   */
  DebugGaussian: 12,
  /** DEV-only Cartesian-grid volume for axis-alignment verification. */
  DebugCartesian: 13,
  /** DEV-only spherical-shell-and-spoke volume for radial-symmetry verification. */
  DebugSpherical: 14,
} as const;

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
    visible: true,
    maxDistMpc: 1000, // matches the radius in synthetic.ts
    bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
    colourSpec: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
    // Synthetic has no real survey selection function; fall back to the
    // SDSS calibration so the bias-correction pathway has a total
    // `Record<Source, ...>` shape without inventing values.
    mLim: 17.77,
    schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
    iauPrefix: 'Synth',
    tierTargets: {}, // no caps anywhere — synthetic is procedurally sized
    // Bulk-survey defaults; synthetic mags are low so the floor never
    // bites in practice, but pick a consistent value for clarity.
    intensityFloor: 0.02,
    falloffHalfMpc: 1000,
  },
  [Source.SDSS]: {
    type: 'survey',
    code: Source.SDSS,
    label: 'SDSS',
    binBaseName: 'sdss',
    allSky: false,
    visible: true,
    // Main galaxy sample reaches z ~ 0.7+ for luminous red galaxies;
    // rounded up generously.
    maxDistMpc: 3000,
    bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
    colourSpec: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
    // r-band spec completeness limit (SDSS DR1+).
    mLim: 17.77,
    // Blanton et al. 2003, r-band LF for the spec sample.
    schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
    iauPrefix: 'SDSS',
    // small drops SDSS entirely to keep the mobile GPU budget;
    // medium caps at ~156k brightest; large is uncapped (key absent).
    tierTargets: { small: 0, medium: 156_000 },
    intensityFloor: 0.02,
    falloffHalfMpc: 1000,
  },
  [Source.TwoMRS]: {
    type: 'survey',
    code: Source.TwoMRS,
    label: '2MRS',
    binBaseName: '2mrs',
    allSky: true,
    visible: true,
    // Flux-limited at K_s ≈ 11.75; effective z ≲ 0.06.
    maxDistMpc: 250,
    bandLabels: { u: '—', g: 'J', r: 'H', i: 'K', z: '—' },
    // 2MRS has no u/z slots — fall back to J−K (the widest NIR colour
    // pair) for galaxy-type information. K-correction is negligible at
    // the survey's effective z ≲ 0.06.
    colourSpec: { slotA: 'g', slotB: 'i', rangeMin: 0.7, rangeMax: 1.1, kPerZ: 0.0 },
    // Huchra et al. 2012 — K_s ≤ 11.75.
    mLim: 11.75,
    // Kochanek et al. 2001, K-band Schechter from 2MASS.
    schechter: { mStar: -24.13, alpha: -1.1, phiStar: 0.0116 },
    // 2MRS rows carry 2MASS XSC IDs — use the XSC short-name convention.
    iauPrefix: '2MASX',
    // ~44k rows total — small enough to ship intact at every tier; no caps.
    tierTargets: {},
    intensityFloor: 0.02,
    falloffHalfMpc: 1000,
  },
  [Source.Glade]: {
    type: 'survey',
    code: Source.Glade,
    label: 'GLADE',
    binBaseName: 'glade',
    allSky: true,
    visible: true,
    // Covers most of the GLADE distance distribution. GLADE has a long
    // sparse tail past 1 Gpc that the default framing deliberately clips.
    maxDistMpc: 1500,
    bandLabels: { u: '—', g: 'B', r: 'J', i: 'H', z: 'K' },
    // GLADE's g/r slots hold B and J: B−J is a long optical-to-NIR
    // baseline that separates early- from late-type galaxies cleanly.
    colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.5, rangeMax: 3.5, kPerZ: 1.0 },
    // B-band parent samples (HyperLEDA, GWGC) — effective limit ≈ 18.
    mLim: 18.0,
    // Norberg et al. 2002 b_J Schechter as a stand-in for B (close
    // enough for visualisation purposes).
    schechter: { mStar: -20.83, alpha: -1.08, phiStar: 0.0093 },
    iauPrefix: 'GLADE',
    // small keeps the brightest 256k; medium ~400k; large uncapped.
    tierTargets: { small: 256_000, medium: 400_000 },
    intensityFloor: 0.02,
    falloffHalfMpc: 1000,
  },
  [Source.Famous]: {
    type: 'survey',
    code: Source.Famous,
    label: 'Famous',
    binBaseName: 'famous',
    allSky: true, // hand-picked entries from across the sky
    visible: true,
    maxDistMpc: 200, // covers the curated set: M31 → NGC 4889
    // Famous entries don't carry per-row photometry — the source survey
    // already measured it. The SDSS-mirroring labels are cosmetic so the
    // InfoCard renders generic "(g)" tags without a new branch; the
    // stored mag values are NaN, which FullCard renders as "N/A".
    bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
    // Mirror SDSS so the colour ramp maps g−r cleanly; kPerZ = 0 since
    // these entries are all very nearby (z < 0.05).
    colourSpec: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 0.0 },
    // Famous entries have NaN photometry (vMaxWeight short-circuits to 0
    // for those rows), so the bias-pipeline never actually consumes
    // these. Mirror the SDSS calibration to keep the registry total.
    mLim: 17.77,
    schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
    iauPrefix: 'Famous',
    // ~150 rows total — never subsampled; one file shared across tiers.
    tierTargets: {},
    intensityFloor: 0.02,
    falloffHalfMpc: 1000,
  },
  [Source.Cluster]: {
    type: 'poi',
    code: Source.Cluster,
    label: 'Cluster',
    allSky: true,
    visible: true,
  },
  [Source.Supercluster]: {
    type: 'poi',
    code: Source.Supercluster,
    label: 'Supercluster',
    allSky: true,
    visible: true,
  },
  [Source.Void]: { type: 'poi', code: Source.Void, label: 'Void', allSky: true, visible: true },
  [Source.Milliquas]: {
    type: 'survey',
    code: Source.Milliquas,
    label: 'Milliquas',
    binBaseName: 'milliquas',
    allSky: true,
    // Hidden by default until the quasar-specific render path lands.
    // The `.bin` is still fetched (Milliquas is in SURVEY_SOURCES so
    // cloudLoader requests it); the bit just stays clear in the visible
    // mask so the existing galaxy billboards don't represent unresolved
    // AGN until dedicated quasar visuals exist.
    visible: false,
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
    // B−R is the natural quasar colour: blue quasars sit near 0; red /
    // dust-obscured AGN extend to ≳ 2. kPerZ is non-zero because the
    // observed-frame band sweeps through the Lyα forest at high z, but
    // kept modest until the bias-correction subsystem wires Milliquas in.
    colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.0, rangeMax: 2.0, kPerZ: 0.5 },
    // Milliquas's quasar-completeness limit varies wildly by parent
    // survey (SDSS DR16Q reaches r ~ 22, DESI EDR ~ 23, bright optical/
    // X-ray-selected subsamples cut at ~18). We use a permissive limit
    // so vMaxWeight short-circuits rather than upweighting an unphysical
    // volume — a per-parent-survey breakdown would belong in its own pass.
    mLim: 22.0,
    // Quasars don't follow the galaxy Schechter LF — they have their
    // own QLF (Croom et al. 2009, Ross et al. 2013) with very different
    // parameters. The SDSS galaxy values are a placeholder for the
    // shape; vMaxWeight short-circuits to zero for NaN-photometry rows
    // so this rarely fires in practice.
    schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
    // Matches the upstream catalogue's own short-name convention.
    iauPrefix: 'MQ',
    // small drops Milliquas entirely (mobile GPU budget); medium caps at
    // ~200k brightest; large is uncapped.
    tierTargets: { small: 0, medium: 200_000 },
    // Quasars sit at apparent mag 18–22+; with the bulk-survey floor of
    // 0.02 most rows would pin to it and look identical. A higher floor
    // (0.15) keeps the faint tail distinguishable. The 1000-Mpc fade
    // half-distance attenuates the catalog to ~0.04 at d=5 Gpc — kills
    // the high-z quasars the whole catalog exists to show — so we set
    // an effectively-infinite half-distance to disable distance fade
    // for this source while keeping the toggle architecture intact.
    intensityFloor: 0.15,
    falloffHalfMpc: 1e30,
  },
  [Source.Filaments]: {
    type: 'filament',
    code: Source.Filaments,
    label: 'Filaments',
    allSky: true, // full-sky DisPerSE skeleton
    // Off by default — the line geometry overlays the cosmic-web wedge
    // and most users want the points-only view first. They can flip it
    // on in the SettingsPanel.
    visible: false,
    binBaseName: 'filaments',
    // 1.0 is the unit baseline; user scales it down for a subtler overlay
    // or up for emphasis via the (future) Filaments slider.
    intensity: 1.0,
  },
  [Source.Cf4Density]: {
    type: 'volume',
    code: Source.Cf4Density,
    label: 'CF-4 DM density',
    allSky: true, // Valade 2024 reconstruction covers the full 256³ box
    // Default-off: ~32 MB voxel payload fetched eagerly at boot so the
    // toggle in the Volumes panel feels instant, but the field doesn't
    // render until the user opts in.
    visible: false,
    handle: 'cf4-density',
    // Underscore in the filename for legacy reasons; `handle` mirrors it
    // in kebab-case for UI / settings keys.
    binBaseName: 'cf4_density',
    tiered: false, // single 256³ cube; no per-tier variants
    // Presentation defaults — see VolumeFieldDefaults docstrings for the
    // semantics of each knob, and the prior `volumeFieldDefaults.ts`
    // module header for the rationale behind these specific numbers.
    paletteId: 'coolwarm',
    contrast: 1.2,
    contrastCenter: 0.5,
    densityScale: 20.0,
    envelope: { inner: 0.9, outer: 1.0 },
    exposure: 1.0,
    trim: 0.0,
    // CF-4's calibrated coolwarm sits comfortably at the global default
    // — kept explicit so every volume entry carries the field.
    intensity: 0.5,
  },
  [Source.Mcpm]: {
    type: 'volume',
    code: Source.Mcpm,
    label: 'MCPM Cosmic Web',
    allSky: true, // SDSS DR17 VAC, full SDSS volume
    // Default-on: this is the headline cosmic-web overlay; the global
    // intensity of 1.0 (set on this entry) gives it presence on first paint.
    visible: true,
    handle: 'mcpm',
    binBaseName: 'mcpm',
    tiered: true, // small / medium / large `.scfd` variants
    paletteId: 'inferno',
    contrast: 1.7,
    contrastCenter: 0.0,
    densityScale: 18.0,
    envelope: { inner: 0.85, outer: 1.05 },
    exposure: 18.0,
    trim: 0.3,
    intensity: 1.0,
  },
  // ── DEV-only synthetic volume fixtures ────────────────────────────
  // Procedural cubes used to verify axis alignment, scale, and origin.
  // `binBaseName: null` because they have no on-disk payload; the slot
  // factory generates them in `import.meta.env.DEV` builds.
  // `envelope: { inner: 2.0, outer: 2.0 }` (both >= √3) keeps the cube
  // corners visible — the whole point of these fixtures.
  [Source.DebugGaussian]: {
    type: 'volume',
    code: Source.DebugGaussian,
    label: 'Gaussian (debug)',
    allSky: true,
    visible: false,
    handle: 'debug-gaussian',
    binBaseName: null,
    tiered: false,
    paletteId: 'blue-purple',
    contrast: 1.0,
    contrastCenter: 0.5,
    // A single Gaussian peak integrates to roughly √(2π)·σ along its
    // central axis; 10× lifts the peak into saturation while leaving
    // the intensity slider plenty of low-end headroom.
    densityScale: 10.0,
    envelope: { inner: 2.0, outer: 2.0 },
    exposure: 1.0,
    trim: 0.0,
  },
  [Source.DebugCartesian]: {
    type: 'volume',
    code: Source.DebugCartesian,
    label: 'Cartesian grid (debug)',
    allSky: true,
    visible: false,
    handle: 'debug-cartesian',
    binBaseName: null,
    tiered: false,
    paletteId: 'viridis',
    contrast: 1.0,
    contrastCenter: 0.5,
    // A ray crosses ~8 grid planes per axis at default settings, so
    // integrated density is much higher than the Gaussian — 4× is
    // enough to saturate near intensity=1.0.
    densityScale: 4.0,
    envelope: { inner: 2.0, outer: 2.0 },
    exposure: 1.0,
    trim: 0.0,
  },
  [Source.DebugSpherical]: {
    type: 'volume',
    code: Source.DebugSpherical,
    label: 'Spherical grid (debug)',
    allSky: true,
    visible: false,
    handle: 'debug-spherical',
    binBaseName: null,
    tiered: false,
    paletteId: 'magma',
    contrast: 1.0,
    contrastCenter: 0.5,
    // A ray typically crosses one or two shells plus a spoke — sits
    // between Gaussian (sparse) and Cartesian (dense) integrated density.
    densityScale: 6.0,
    envelope: { inner: 2.0, outer: 2.0 },
    exposure: 1.0,
    trim: 0.0,
  },
} as const satisfies Readonly<Record<SourceType, SourceEntry>>;

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
export const SURVEY_SOURCES: readonly SourceType[] = [
  Source.Synthetic,
  Source.Famous,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
];
