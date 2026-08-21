/**
 * EngineAssetSlots — the engine's asset-slot bag, populated alongside the GPU
 * renderer. Each slot's race-checked `commit` is the structural fix for tier-swap
 * stomping: a stale load can no longer overwrite a newer one.
 *
 * `| null` fields are minted later — in `wireSlots`, or in `initGpu` beside the
 * renderer their commit closes over — and must be null-checked; the Maps are
 * declared empty and need no check. A 404 or decode failure surfaces as a commit
 * that never fires, never as an error path.
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
import type { Polyphorm2MRSReq } from '../../loading/Polyphorm2MRSReq';
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
   * Star twin of `points`, separate because one shared map erases both payload
   * pairs to a union every consumer re-narrows. Registry-built: `installSlots`
   * routes numeric keys whose entry is `type: 'starCatalog'` here, so the commit
   * null-guards `state.gpu.starCatalogRenderer` instead of closing over it.
   */
  starCatalogs: Map<SourceType, AssetSlot<StarCatalog, StarCatalogReq>>;
  /** Loaded once at boot and NOT swapped on tier change — see `filamentFetcher.ts`. */
  filaments: AssetSlot<FilamentCloud, FilamentReq> | null;
  /** Eager at boot; no `commit` — the subscriber dispatches the parsed array into the `engine` slice. */
  famousGalaxiesMeta: AssetSlot<FamousGalaxiesPayload, CompanionAssetReq> | null;
  /** Eager because famous stars are a seeded catalog — no sibling `.bin` fetch to key demand off. */
  famousStarsMeta: AssetSlot<FamousStarsPayload, CompanionAssetReq> | null;
  /** Eager at boot; `wireStructureProjection` turns the ready value into structure-store records. */
  structureCatalog: AssetSlot<StructureCatalogPayload, StructureCatalogReq> | null;
  /** ~1.7 MB and lazy: only the public handle's `loadPgcAliases()` calls `.load()`, on first palette open. */
  pgcAlias: AssetSlot<PgcAliasMap, void> | null;
  /** Valade 2024 256³ HAMLET cube, ~32 MB decoded — default-off, so that cost is opt-in only. */
  cf4Density: AssetSlot<ScalarCube, void> | null;
  /**
   * SDSS DR17 Cosmic Slime VAC `SDSS_z_44-476mpc` (Wilde et al. 2023), 712×1200×728
   * voxels native in three tiers. Tier-aware and default-on, so `setTier` reloads it.
   */
  mcpm: AssetSlot<ScalarCube, MCPMReq> | null;
  /** CF4++ `flowfield.scfd`, SCFD v3 `channels = 4`: rgb = velocity, a = overdensity δ. Tier-agnostic, default-off. */
  flow: AssetSlot<ScalarCube, void> | null;
  /**
   * `polyphorm-2mrs-{small,medium,large}.scfd` — 2MRS Polyphorm-derived cosmic-web
   * density volume. Tier-aware like `mcpm`, default-off.
   */
  polyphorm2Mrs: AssetSlot<ScalarCube, Polyphorm2MRSReq> | null;
  /**
   * `mcpm-workbench.scfd` — cube promoted from the MCPM workbench dev tool via
   * `tools/volumes/promoteWorkbenchExport.ts`. Untiered like CF-4 (void
   * request), default-off, hidden pending a promotion decision.
   */
  mcpmWorkbench: AssetSlot<ScalarCube, void> | null;
  /**
   * Opt-in on `settings.constellations.enabled`. The commit uploads the static
   * segment buffer and kicks `syncVisibilityFades`, ramping the seeded-0
   * demand-loaded fade up to the toggle's intent; the pass itself only draws.
   */
  constellations: AssetSlot<ConstellationsArtifact, void> | null;
  /**
   * One slot per `(bodyId, kind)` map, keyed by the composite `BodyTextureSlotKey`
   * (`'earth:surface'`, the ring strip `'saturn-ring:surface'`, …). Proximity-gated
   * with hysteresis — demanded inside the body's load radius, released outside twice
   * it — and re-fetched at the clamped tier on a data-volume tier change.
   */
  bodyTextures: Map<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>>;
  /**
   * All-bodies atlas (`body-atlas.webp`): one 512×256 tile per textured body in a
   * single ~180 KB image, fetched first (`priority: 0`). One asset for the whole set —
   * no tier, no proximity gate — and its commit fans the decoded bitmap out to every
   * renderer's PLACEHOLDER layer, which is what lets it and the per-body maps arrive
   * in either order with no check.
   */
  bodyTextureAtlas: AssetSlot<ImageBitmap, void> | null;
  /**
   * Dev-only synthetic test cubes, keyed by the in-engine handle the commit
   * registers. `undefined` rather than null in production: `wireSlots` mints them
   * only under `import.meta.env.DEV`, so the generators tree-shake out entirely.
   */
  syntheticVolumes?: Record<string, AssetSlot<ScalarCube, SyntheticVolumeReq>>;
};
