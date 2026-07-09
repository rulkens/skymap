/**
 * `Source` enum + `SOURCE_REGISTRY`.
 *
 * The single registry of every data source skymap loads. Six kinds,
 * discriminated by `type`:
 *
 *   'galaxyCatalog' — per-point galaxy catalogs (SDSS, GLADE, 2MRS, Famous,
 *                     Milliquas, DESI Deep, Synthetic).  Codes are baked
 *                     into the `.bin` point-cloud format and packed into
 *                     the pick texture.
 *   'structure'     — galaxy-cluster / supercluster / void / group marker rings.
 *                     Codes are also packed into the pick texture (upper 5 bits).
 *   'filament'      — derived line-strip geometry (DisPerSE skeleton).
 *                     Single global asset; no per-record identity.
 *   'volume'        — scalar-field cubes (CF-4 DM density, MCPM cosmic web).
 *                     Each volume carries its own presentation defaults
 *                     (palette, contrast, exposure, …).
 *   'milkyWay'      — procedural galactic-disk overlay. Single global
 *                     overlay; no asset, no per-record identity.
 *   'flow'          — CF4++ peculiar-velocity field overlay (single
 *                     flowfield.scfd cube). No per-record identity; carries
 *                     its own look/motion defaults.
 *
 * Only `'galaxyCatalog'` and `'structure'` codes are persisted to disk / packed into
 * GPU buffers; `'filament'`, `'volume'`, `'milkyWay'`, and `'flow'` codes exist
 * solely so every data source has one place to look. The visibility-bitmask helpers
 * (`utils/maskHas`, `utils/maskWith`, `utils/maskWithout`) operate on
 * galaxy catalog codes only.
 *
 * The `Source` enum lives in `./source` (the leaf, so the per-source entry
 * modules can import it without cycling back through this barrel). Each
 * registry row lives in its own `./sources/<id>.ts` module — this file is
 * the assembler that imports every `*_ENTRY` and stitches them into the
 * keyed `SOURCE_REGISTRY`, then re-exports `Source` so existing importers
 * are unchanged.
 */

import type { SourceEntry } from '../@types/data/SourceEntry';
import type { SourceType } from '../@types/data/SourceType';
import type { Tier } from '../@types/data/Tier';

import { Source } from './source';
import { SYNTHETIC_ENTRY } from './sources/synthetic';
import { SDSS_ENTRY } from './sources/sdss';
import { TWOMRS_ENTRY } from './sources/twomrs';
import { GLADE_ENTRY } from './sources/glade';
import { FAMOUS_GALAXY_ENTRY } from './sources/famous-galaxy';
import { CLUSTER_ENTRY } from './sources/cluster';
import { SUPERCLUSTER_ENTRY } from './sources/supercluster';
import { VOID_ENTRY } from './sources/void';
import { GROUP_ENTRY } from './sources/group';
import { MILLIQUAS_ENTRY } from './sources/milliquas';
import { FILAMENTS_ENTRY } from './sources/filaments';
import { CF4_DENSITY_ENTRY } from './sources/cf4-density';
import { MCPM_ENTRY } from './sources/mcpm';
import { DEBUG_GAUSSIAN_ENTRY } from './sources/debug-gaussian';
import { DEBUG_CARTESIAN_ENTRY } from './sources/debug-cartesian';
import { DEBUG_SPHERICAL_ENTRY } from './sources/debug-spherical';
import { MILKY_WAY_ENTRY } from './sources/milky-way';
import { FLOW_ENTRY } from './sources/flow';
import { DESI_DEEP_ENTRY } from './sources/desiDeep';
import { DESI_WEDGE_ENTRY } from './sources/desiWedge';
import { DESI_SGW_ENTRY } from './sources/desiSgw';
import { DESI_SGW_SHAPE_ENTRY } from './sources/desiSgwShape';

export { Source } from './source';

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Per-source metadata, keyed by every `Source`. Discriminated by `type`;
 * see the `GalaxyCatalogSourceEntry` / `StructureSourceEntry` definitions for the field shapes.
 *
 * `as const satisfies Readonly<Record<Source, SourceEntry>>` preserves each
 * entry's literal `type`, so `SOURCE_REGISTRY[Source.SDSS]` narrows to
 * `GalaxyCatalogEntry` at use sites without manual casts.
 *
 * Convention notes that aren't expressed by the types:
 *
 * - **`label`** follows galaxy-catalog-team capitalisation (`'2MRS'` no space,
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
 *
 * Key insertion order is load-bearing: `sourceEntries.ts` /
 * `sourceIds.ts` derive `SOURCE_ENTRIES` / `SOURCE_IDS` via
 * `Object.values`, so the order here is the order those arrays carry.
 */
export const SOURCE_REGISTRY = {
  [Source.Synthetic]: SYNTHETIC_ENTRY,
  [Source.SDSS]: SDSS_ENTRY,
  [Source.TwoMRS]: TWOMRS_ENTRY,
  [Source.Glade]: GLADE_ENTRY,
  [Source.FamousGalaxy]: FAMOUS_GALAXY_ENTRY,
  [Source.Cluster]: CLUSTER_ENTRY,
  [Source.Supercluster]: SUPERCLUSTER_ENTRY,
  [Source.Void]: VOID_ENTRY,
  [Source.Group]: GROUP_ENTRY,
  [Source.Milliquas]: MILLIQUAS_ENTRY,
  [Source.Filaments]: FILAMENTS_ENTRY,
  [Source.Cf4Density]: CF4_DENSITY_ENTRY,
  [Source.Mcpm]: MCPM_ENTRY,
  [Source.DebugGaussian]: DEBUG_GAUSSIAN_ENTRY,
  [Source.DebugCartesian]: DEBUG_CARTESIAN_ENTRY,
  [Source.DebugSpherical]: DEBUG_SPHERICAL_ENTRY,
  [Source.MilkyWay]: MILKY_WAY_ENTRY,
  [Source.Flow]: FLOW_ENTRY,
  [Source.DesiDeep]: DESI_DEEP_ENTRY,
  [Source.DesiWedge]: DESI_WEDGE_ENTRY,
  [Source.DesiSgw]: DESI_SGW_ENTRY,
  [Source.DesiSgwShape]: DESI_SGW_SHAPE_ENTRY,
} as const satisfies Readonly<Record<SourceType, SourceEntry>>;

// ─── Famous-galaxy high-res LOD ─────────────────────────────────────────────

/**
 * Sizing for the `texture_2d_array` that holds the curated Famous-galaxy
 * thumbnails at full curator resolution (the close-approach LOD that
 * supersedes the shared 128 px atlas tile when a galaxy fills enough
 * pixels on screen).
 *
 * Why a fixed N and per-tier `layerSide`:
 *
 *   - Eight layers is the LRU working set we sized to "the handful of
 *     famous galaxies the camera is likely to be near at once" — enough
 *     for cluster fly-throughs (Virgo, Coma) without thrashing, small
 *     enough that the GPU footprint stays inside the per-tier budget.
 *   - `layerSide` is tier-aware because the dominant cost is
 *     `N * layerSide² * 4 bytes`. With N=8: 1024² → 32 MB (desktop /
 *     "medium"+"large"), 512² → 8 MB (mobile / "small"). The curator
 *     emits 1024 px sources; the mobile path downsamples at decode time
 *     via `createImageBitmap`'s `resizeWidth`/`resizeHeight`.
 *
 * Treat both as load-bearing: the memory bound documented in
 * `docs/adrs/0002-tiered-thumbnail-textures.md` and the fade-band math
 * in the design spec assume these exact values.
 */
export const HI_RES_LAYER_COUNT = 8 as const;

export const HI_RES_LAYER_SIDE_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 512,
  medium: 1024,
  large: 1024,
} as const;

// ─── Iteration order ────────────────────────────────────────────────────────

/**
 * Galaxy catalog sources in UI presentation order — smallest catalogue → largest
 * (Famous → 2MRS → SDSS → GLADE, ~20 → 38 k → 500 k → 2 M rows). Synthetic
 * leads as the procedural-fallback cloud, hidden from user-facing lists.
 *
 * Listed explicitly rather than `Object.values(Source)` so adding a source
 * to the file-format enum doesn't silently promote it into the UI and the
 * visibility bitmask.
 */
export const GALAXY_CATALOG_SOURCES: readonly SourceType[] = [
  Source.Synthetic,
  Source.FamousGalaxy,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
  Source.DesiSgwShape,
];
