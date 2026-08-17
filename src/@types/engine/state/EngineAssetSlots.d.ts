/**
 * EngineAssetSlots — the asset-slot bag owned by the engine and populated
 * alongside the GPU renderer.
 *
 * The asset-loading rework migrates each per-source fetch+upload path from
 * the old imperative `cloudLoader.reloadSource` to a `createAssetSlot`
 * whose race-checked `commit` step is the structural fix for tier-swap
 * stomping bugs.  Task 8 introduced the SDSS slot; Task 9 extends the bag
 * with the other galaxy catalogs (2MRS, GLADE, Famous) plus the filament layer.
 *
 * `points` is keyed by Source so any future per-source consumer can look
 * up the active slot for a galaxy catalog without iterating.  `filaments` is a
 * single slot rather than a map because filaments are a global derived
 * asset, not a per-galaxy-catalog one — the request type carries `tier` alone,
 * no `source`.
 *
 * Filaments load exactly once at boot and are NOT swapped on tier change.
 * See `services/loading/fetchers/filamentFetcher.ts` for the rationale
 * (re-downloading tens of MB for what is mostly the same skeleton
 * topology isn't worth it).
 */

import type { AssetSlot } from '../../loading/AssetSlot';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../loading/GalaxyCatalogReq';
import type { FilamentCloud } from '../../data/filament/FilamentCloud';
import type { FilamentReq } from '../../loading/FilamentReq';
import type { FamousGalaxiesPayload } from '../../loading/FamousGalaxiesPayload';
import type { FamousStarsPayload } from '../../loading/FamousStarsPayload';
import type { PgcAliasMap } from '../../loading/PgcAliasMap';
import type { ScalarCube } from '../../data/volume/ScalarCube';
import type { SyntheticVolumeReq } from '../../loading/SyntheticVolumeReq';
import type { MCPMReq } from '../../loading/MCPMReq';
import type { CompanionAssetReq } from '../../loading/CompanionAssetReq';
import type { StructureCatalogPayload } from '../../loading/StructureCatalogPayload';
import type { StructureCatalogReq } from '../../loading/StructureCatalogReq';
import type { ConstellationsArtifact } from '../../loading/ConstellationsArtifact';
import type { StarCatalog } from '../../data/starCatalog/StarCatalog';
import type { StarCatalogReq } from '../../loading/StarCatalogReq';
import type { SourceType } from '../../data/SourceType';
import type { BodyTextureReq } from '../../loading/BodyTextureReq';
import type { BodyTextureSlotKey } from '../../data/BodyTextureSlotKey';

export type EngineAssetSlots = {
  points: Map<SourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>;
  /**
   * Per-source survey star catalogs (the Gaia bin today) — the star twin of
   * `points`, keyed by the numeric `Source` code so any consumer can look up
   * a star row's slot without iterating. A SEPARATE map rather than a widened
   * `points` because the payload/request types differ (`StarCatalog` /
   * `StarCatalogReq` vs the galaxy pair) — one shared map would erase both to
   * a union every consumer re-narrows. Unlike `points` (minted and
   * self-installed in initGpu, next to the renderer the commit closes over),
   * these slots are registry-built: `installSlots` routes numeric keys whose
   * registry entry is `type: 'starCatalog'` into this map, and the slot's
   * commit null-guards `state.gpu.starCatalogRenderer` instead of closing
   * over it. Declared up-front as an empty Map (like `points`) so consumers
   * need no null check.
   */
  starCatalogs: Map<SourceType, AssetSlot<StarCatalog, StarCatalogReq>>;
  /**
   * Null until the GPU init IIFE constructs the filament renderer and
   * mints this slot — same lifecycle pattern as `state.gpu.pointRenderer`.
   * Consumers null-check before calling `.load()` (in practice only the
   * boot path touches it, and only after the IIFE has populated it).
   */
  filaments: AssetSlot<FilamentCloud, FilamentReq> | null;
  /**
   * Famous-galaxy `famous_galaxies_meta.json` sidecar routed through a slot for
   * parity with point loads.  Loaded eagerly at engine boot — the JSON
   * is tiny so the cost is negligible, and the InfoCard depends on
   * `meta` being present whenever a famous galaxy is hovered.  The
   * subscriber dispatches the parsed array into the Redux `engine` slice;
   * the engine reads it back via `state.famousGalaxiesMeta`.
   *
   * No `commit` step — there is nothing GPU-side to upload, just the
   * dispatch done by the subscriber.  Null until the IIFE mints it
   * (matches `filaments` for the same lifecycle reason).
   */
  famousGalaxiesMeta: AssetSlot<FamousGalaxiesPayload, CompanionAssetReq> | null;
  /**
   * Famous-star `famous_stars_meta.json` sidecar — the star twin of
   * `famousGalaxiesMeta`, routed through the same asset-slot machinery so the two
   * curated sources load their metadata the same way.  Loaded eagerly at
   * engine boot (`demand: () => true`, like `bodyTextureAtlas`): unlike
   * `famousGalaxiesMeta`, there is no sibling `.bin` fetch to key the demand off —
   * the famous stars are a seeded catalog compiled straight into the bundle
   * — so the sidecar's own eagerness is the only signal. The subscriber
   * reports the parsed array to the engine Redux slice
   * (`engineFamousStarsMetaReported`), the only place it is read from: unlike
   * `famousGalaxiesMeta`, no engine code consults these entries, just the InfoCard.
   *
   * No `commit` step — there is nothing GPU-side to upload, just the store
   * dispatch done by the subscriber. Null until the IIFE mints it (matches
   * `famousGalaxiesMeta` for the same lifecycle reason).
   */
  famousStarsMeta: AssetSlot<FamousStarsPayload, CompanionAssetReq> | null;
  /**
   * Cluster/supercluster coverage layer (`structures.ccat` + `structures_meta.json`)
   * routed through a slot for parity with the other CPU-side sidecars.  Loaded
   * eagerly at engine boot; the payload is small.
   *
   * No `commit` step — there is nothing GPU-side to upload.  `wireStructureProjection`
   * subscribes to this slot and converts the ready value into structure records
   * written into the structure store.  Null until the IIFE mints it
   * (matches `famousGalaxiesMeta` for the same lifecycle reason).
   */
  structureCatalog: AssetSlot<StructureCatalogPayload, StructureCatalogReq> | null;
  /**
   * PGC → human-name alias map (`pgc_aliases.json`, ~1.7 MB).  Lazy:
   * the engine never auto-loads it; the public-handle's
   * `loadPgcAliases()` shim calls `slot.load()` on first palette open.
   * Same null-then-set lifecycle as the filament slot.
   *
   * Routed through a slot (rather than a direct fetch) so progress events
   * flow through the same `aggregateRegistry` reporter as every other
   * load, and so retry/cancel semantics match.
   */
  pgcAlias: AssetSlot<PgcAliasMap, void> | null;
  /**
   * CF-4 dark-matter density volume — Valade 2024 256³ HAMLET cube.
   *
   * Default-off, so demand-loaded: the slot stays idle until the user
   * enables the field in the Volumes panel, at which point the per-frame
   * `reevaluateDemand` fires `cf4DensityFetcher` and the commit registers
   * the cube as the `'cf4-density'` field on the scalar-volume renderer.
   * The ~32 MB of decoded voxel data is therefore paid only on opt-in,
   * not on every page load.
   *
   * Null until `wireSlots` mints it (matches `filaments` for the same
   * lifecycle reason — the renderer must exist before the slot can
   * commit). Missing/404 .scfd surfaces as a never-fires commit; the
   * field simply won't appear in the Volumes panel.
   */
  cf4Density: AssetSlot<ScalarCube, void> | null;
  /**
   * MCPM Cosmic Web density volume — SDSS DR17 Cosmic Slime VAC
   * `SDSS_z_44-476mpc` cube (Wilde et al. 2023), 712×1200×728 voxels at
   * native resolution, downsampled into three tiers.
   *
   * Tier-aware (unlike cf4Density above). Default-on (the headline
   * cosmic-web overlay), so demand loads it at boot with the `tier` root
   * slice (`state.tier`); `engine.setTier` reloads it on tier change.
   *
   * Null until `wireSlots` mints it (matches cf4Density for the same
   * lifecycle reason — the renderer must exist before commit).
   */
  mcpm: AssetSlot<ScalarCube, MCPMReq> | null;
  /**
   * CF4++ velocity flow field — single tier-agnostic `flowfield.scfd`
   * (SCFD v3, `channels = 4`: rgb = velocity, a = overdensity δ).
   *
   * Default-off, so demand-loaded (mirrors `cf4Density`): the slot stays
   * idle until the user enables flow (Phase D UI), at which point the
   * per-frame `reevaluateDemand` fires `flowFieldFetcher` and the commit
   * marks the layer loaded.  The decoded cube is paid only on opt-in, not
   * on every page load.
   *
   * Null until `wireSlots` mints it (matches `cf4Density` for the same
   * lifecycle reason).  The commit's GPU upload + flow-renderer handoff
   * arrive in Phase C — the receiving renderer lands then; Phase B's
   * commit only proves the fetch → decode → commit path.
   */
  flow: AssetSlot<ScalarCube, void> | null;
  /**
   * True-3D constellation stick-figure artifact (`constellations.json`) routed
   * through a slot for parity with the other CPU-side sidecars. Opt-in (defaults
   * off), demand-loaded on the layer's master gate (`settings.constellations.enabled`),
   * mirroring `flow`.
   *
   * The `commit` runs once on artifact-ready: it uploads the segment set to
   * `constellationRenderer` (a static, tier-agnostic buffer) and kicks
   * `syncVisibilityFades` for the `constellations` row, ramping the seeded-0
   * demand-loaded fade up to the master toggle's intent. The pass only draws.
   * The label producer reads the artifact straight off the slot's ready value.
   * Null until `wireSlots` mints it (matches `structureCatalog` / `flow` for the
   * same lifecycle reason). A missing/404 artifact surfaces as a never-fires
   * commit; the overlay simply stays empty.
   */
  constellations: AssetSlot<ConstellationsArtifact, void> | null;
  /**
   * The keyed body-texture family — one slot per `(bodyId, kind)` map, keyed by
   * the composite `BodyTextureSlotKey` (`'earth:surface'`, `'mars:surface'`, the
   * Saturn ring strip `'saturn-ring:surface'`, and — with the feature PRs —
   * Earth's `'earth:night'` / `'earth:clouds'`).
   *
   * A keyed Map that mirrors `points`: any consumer looks up a body's texture
   * slot by its composite key without iterating, and the family shares one
   * fetcher + demand/release rail rather than a per-body field. Each slot is
   * proximity-gated (demanded inside the body's own load radius, released
   * outside twice it — hysteresis) and re-fetched at the clamped current tier on
   * a data-volume tier change. Earth's former bespoke single-texture path folds
   * into this family as key `'earth:surface'`.
   *
   * Unlike `flow` / `cf4Density` (null-then-set named fields), these are
   * minted directly in `wireSlots` — the same externally-built posture as the
   * `points` slots — so the Map is declared non-null (empty at construction,
   * filled during `wireSlots`) and consumers need no null check. A 404 /
   * decode failure surfaces as a never-fires commit; the renderer keeps its
   * flat-albedo placeholder.
   */
  bodyTextures: Map<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>>;
  /**
   * The low-resolution all-bodies surface atlas (`body-atlas.webp`) — one
   * 512×256 tile per textured body in a single ~160 KB image, fetched first at
   * boot (`priority: 0`) so every body has its own surface to draw before any
   * hi-res map lands.
   *
   * A singleton sidecar field (like `constellations` / `flow`) rather than a
   * member of the `bodyTextures` map above, because it is ONE asset for the
   * whole set: one request, no tier, no proximity gate. Its commit fans the one
   * decoded bitmap out to every body renderer's PLACEHOLDER layer, which is what
   * lets it and the per-body maps arrive in either order with no check.
   *
   * Null until `wireSlots` mints it (matches the other named sidecars). A 404 /
   * decode failure surfaces as a never-fires commit; every renderer keeps the
   * 1×1 placeholder it drew before this asset existed.
   */
  bodyTextureAtlas: AssetSlot<ImageBitmap, void> | null;
  /**
   * Dev-only slots for the synthetic test cubes (Gaussian blob,
   * Cartesian grid, spherical grid).  `undefined` (not the slots being
   * null) in production builds — the `wireSlots` phase only mints
   * them when `import.meta.env.DEV` is true, so tree-shaking removes
   * the fetcher module + procedural generators entirely from
   * production bundles.
   *
   * Keyed by the in-engine handle the slot's commit registers, so
   * iterating the record is the same set of names that show up in
   * the SettingsPanel's Volumes section.  Engine bootstrap triggers
   * each slot's `.load()` independently with its own request.
   *
   * The `?` (optional) rather than `| null` mirrors how TypeScript
   * expresses "this property may not exist on the object at all",
   * which is more accurate here than null-then-set: in production
   * the field is never assigned, so accessing it returns `undefined`
   * rather than null.  Consumers should guard with `?.` at the call
   * site.
   */
  syntheticVolumes?: Record<string, AssetSlot<ScalarCube, SyntheticVolumeReq>>;
};
