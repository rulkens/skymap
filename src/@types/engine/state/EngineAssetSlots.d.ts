/**
 * EngineAssetSlots — the asset-slot bag owned by the engine and populated
 * alongside the GPU renderer.
 *
 * The asset-loading rework migrates each per-source fetch+upload path from
 * the old imperative `cloudLoader.reloadSource` to a `createAssetSlot`
 * whose race-checked `commit` step is the structural fix for tier-swap
 * stomping bugs.  Task 8 introduced the SDSS slot; Task 9 extends the bag
 * with the other surveys (2MRS, GLADE, Famous) plus the filament layer.
 *
 * `points` is keyed by Source so any future per-source consumer can look
 * up the active slot for a survey without iterating.  `filaments` is a
 * single slot rather than a map because filaments are a global derived
 * asset, not a per-survey one — the request type carries `tier` alone,
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
import type { FilamentCloud } from '../../data/FilamentCloud';
import type { FilamentReq } from '../../loading/FilamentReq';
import type { FamousPayload } from '../../loading/FamousPayload';
import type { PgcAliasMap } from '../../loading/PgcAliasMap';
import type { ScalarCube } from '../../data/ScalarCube';
import type { SyntheticVolumeReq } from '../../loading/SyntheticVolumeReq';
import type { MCPMReq } from '../../loading/MCPMReq';
import type { CompanionAssetReq } from '../../loading/CompanionAssetReq';
import type { StructureCatalogPayload } from '../../loading/StructureCatalogPayload';
import type { StructureCatalogReq } from '../../loading/StructureCatalogReq';
import type { SourceType } from '../../data/SourceType';

export type EngineAssetSlots = {
  points: Map<SourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>;
  /**
   * Null until the GPU init IIFE constructs the filament renderer and
   * mints this slot — same lifecycle pattern as `state.gpu.renderer`.
   * Consumers null-check before calling `.load()` (in practice only the
   * boot path touches it, and only after the IIFE has populated it).
   */
  filaments: AssetSlot<FilamentCloud, FilamentReq> | null;
  /**
   * Famous-galaxy `famous_meta.json` sidecar routed through a slot for
   * parity with point loads.  Loaded eagerly at engine boot — the JSON
   * is tiny so the cost is negligible, and the InfoCard depends on
   * `meta` being present whenever a famous galaxy is hovered.  The
   * subscriber writes the parsed array straight into
   * `state.sources.famousMeta`.
   *
   * No `commit` step — there is nothing GPU-side to upload, just CPU
   * state mutation done by the subscriber.  Null until the IIFE mints it
   * (matches `filaments` for the same lifecycle reason).
   */
  famousMeta: AssetSlot<FamousPayload, CompanionAssetReq> | null;
  /**
   * Cluster/supercluster coverage layer (`structures.ccat` + `structures_meta.json`)
   * routed through a slot for parity with the other CPU-side sidecars.  Loaded
   * eagerly at engine boot; the payload is small.
   *
   * No `commit` step — there is nothing GPU-side to upload.  `wireStructureProjection`
   * subscribes to this slot and converts the ready value into structure records
   * written into the structure store.  Null until the IIFE mints it
   * (matches `famousMeta` for the same lifecycle reason).
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
   * cosmic-web overlay), so demand loads it at boot with
   * `state.sources.tier`; `engine.setTier` reloads it on tier change.
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
