/**
 * `Source` enum + `SOURCE_REGISTRY`.
 *
 * The registry of every data source skymap loads, keyed by `Source` code;
 * see `SourceEntry.d.ts` for the ten `type` kinds it discriminates over.
 * `Source` lives in `./source`; each row lives in its own `./sources/<id>.ts`
 * (the nine galaxy-catalog rows: `layers/galaxyCatalog/sources/`).
 */

import type { SourceEntry } from '../@types/data/SourceEntry';
import type { SourceType } from '../@types/data/SourceType';
import type { Tier } from '../@types/data/Tier';

import { Source } from './source';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../layers/galaxyCatalog/sources/galaxyCatalogSourceRows';
import { sourceRecordOf } from '../utils/data/sourceRecordOf';
import { CLUSTER_ENTRY } from './sources/cluster';
import { SUPERCLUSTER_ENTRY } from './sources/supercluster';
import { VOID_ENTRY } from './sources/void';
import { GROUP_ENTRY } from './sources/group';
import { FILAMENTS_ENTRY } from './sources/filaments';
import { CONSTELLATIONS_ENTRY } from './sources/constellations';
import { CF4_DENSITY_ENTRY } from './sources/cf4-density';
import { MCPM_ENTRY } from './sources/mcpm';
import { POLYPHORM_2MRS_ENTRY } from './sources/polyphorm-2mrs';
import { MCPM_WORKBENCH_ENTRY } from './sources/mcpm-workbench';
import { DEBUG_GAUSSIAN_ENTRY } from './sources/debug-gaussian';
import { DEBUG_CARTESIAN_ENTRY } from './sources/debug-cartesian';
import { DEBUG_SPHERICAL_ENTRY } from './sources/debug-spherical';
import { MILKY_WAY_ENTRY } from './sources/milky-way';
import { FLOW_ENTRY } from './sources/flow';
import { FAMOUS_STAR_ENTRY } from './sources/famous-star';
import { PLANET_ENTRY } from './sources/planet';
import { EARTH_ENTRY } from './sources/earth';
import { SUN_ENTRY } from './sources/sun';
import { SGR_A_STAR_ENTRY } from './sources/sgr-a-star';
import { S_STAR_ENTRY } from './sources/s-star';
import { MESH_BODY_ENTRY } from './sources/mesh-body';
import { GAIA_STARS_ENTRY } from './sources/gaia-stars';
import { ZONE_OF_AVOIDANCE_ENTRY } from './sources/zone-of-avoidance';

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
 * - **`binBaseName`** is the on-disk filename stem; tier-aware filenames
 *   are assembled in `tierFilenameForSource`.
 * - **`maxDistMpc`** is a *display* limit (camera framing), not a strict
 *   cut. Conversion uses `H₀ ≈ 70 km/s/Mpc`; outliers may sit beyond.
 * - **`bandLabels`** records the actual band each `magU/G/R/I/Z` slot
 *   carries. Catalog parsers shoehorn non-SDSS bands into the 5-slot
 *   layout, so labelling rows "(g)" for a 2MRS galaxy would be misleading.
 *   `'—'` (em-dash) marks an empty slot.
 *
 * Key insertion order here is cosmetic: every key is a `Source` code, a
 * non-negative integer, and JS iterates integer-like own keys in ascending
 * numeric order regardless of where they were written — `sourceEntries.ts` /
 * `sourceIds.ts` derive `SOURCE_ENTRIES` / `SOURCE_IDS` via `Object.values`,
 * so those arrays (and anything downstream, e.g. the Labels panel's row
 * order) are ordered by ascending code value. Changing that order needs
 * either renumbering codes (forbidden — codes are append-only by value) or a
 * separate display-order mechanism; neither is a decision this file makes.
 */
const UNFORMED_SOURCE_REGISTRY = {
  [Source.Cluster]: CLUSTER_ENTRY,
  [Source.Supercluster]: SUPERCLUSTER_ENTRY,
  [Source.Void]: VOID_ENTRY,
  [Source.Group]: GROUP_ENTRY,
  [Source.Filaments]: FILAMENTS_ENTRY,
  [Source.Cf4Density]: CF4_DENSITY_ENTRY,
  [Source.Mcpm]: MCPM_ENTRY,
  [Source.DebugGaussian]: DEBUG_GAUSSIAN_ENTRY,
  [Source.DebugCartesian]: DEBUG_CARTESIAN_ENTRY,
  [Source.DebugSpherical]: DEBUG_SPHERICAL_ENTRY,
  [Source.MilkyWay]: MILKY_WAY_ENTRY,
  [Source.Flow]: FLOW_ENTRY,
  [Source.FamousStar]: FAMOUS_STAR_ENTRY,
  [Source.Planet]: PLANET_ENTRY,
  [Source.Earth]: EARTH_ENTRY,
  [Source.GaiaStars]: GAIA_STARS_ENTRY,
  [Source.Constellations]: CONSTELLATIONS_ENTRY,
  [Source.Sun]: SUN_ENTRY,
  [Source.SgrAStar]: SGR_A_STAR_ENTRY,
  [Source.SStar]: S_STAR_ENTRY,
  [Source.ZoneOfAvoidance]: ZONE_OF_AVOIDANCE_ENTRY,
  [Source.Polyphorm2MRS]: POLYPHORM_2MRS_ENTRY,
  [Source.McpmWorkbench]: MCPM_WORKBENCH_ENTRY,
  [Source.MeshBody]: MESH_BODY_ENTRY,
} as const;

export const SOURCE_REGISTRY = {
  ...UNFORMED_SOURCE_REGISTRY,
  ...sourceRecordOf(GALAXY_CATALOG_SOURCE_ROWS),
} as const satisfies Readonly<Record<SourceType, SourceEntry>>;
// `sourceRecordOf`'s element type narrows `SourceType` to the rows tuple's
// code union, so `SOURCE_REGISTRY[code]` narrows to a galaxy entry at every
// iterating site — `.category` and `.priority` read off it without a cast.

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

/** Galaxy catalog codes, `GALAXY_CATALOG_SOURCE_ROWS` order — see that file. */
export const GALAXY_CATALOG_SOURCES: readonly (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][0][] =
  GALAXY_CATALOG_SOURCE_ROWS.map(([code]) => code);
