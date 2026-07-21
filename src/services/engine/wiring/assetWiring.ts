/**
 * ASSET_WIRING — the flat registry of every fetchable asset's lifecycle
 * contract (`key` + `factory` + `req` + `demand`), iterated by `wireSlots`
 * to construct the engine's slot table and by `reevaluateDemand` to decide
 * which slots should be loading right now.
 *
 * ### The unifying idea: "is this asset required?"
 *
 * Every row's `demand(ctx)` collapses one asset's entire load policy into a
 * single pure predicate over the `DemandCtx` read surfaces. The demand
 * loop re-runs the whole table on any state change, so "is it required?" has
 * exactly one answer per asset, in one place, re-evaluated uniformly — no
 * scattered per-toggle imperative load calls that can be missed on a new
 * edge (tier flip while a source is hidden, a settings toggle mid-flight,
 * etc.).
 *
 * ### Two corrections to the original demand table (bug fixes)
 *
 *   - **filaments** gates on `settings.filaments.enabled` — the real master
 *     toggle, so a disabled filament overlay never fetches the skeleton.
 *   - **structureCatalog** gates on structure-category visibility: it loads when
 *     ANY of the cluster / supercluster / void categories has its ring OR label
 *     enabled, read from the per-category item rows
 *     (`structures.items[cat].enabled` / `.labelEnabled`) — the single home for
 *     both axes. With every category visible by default, the catalog still
 *     loads at boot (behaviour-preserving); only a user who hides every
 *     structure category's ring AND label skips the fetch. This is the
 *     structures-enabled proxy.
 *
 * ### What is NOT a row here
 *
 *   - **Cluster / Supercluster / Void** `Source`s — they have no individual
 *     fetch; their geometry arrives via the single `'structureCatalog'` row.
 *   - **DEV synthetic volumes** (`debug-gaussian` / `-cartesian` / `-spherical`)
 *     — minted only under `import.meta.env.DEV` via `createSyntheticVolumeSlots`
 *     and triggered there. Keeping them out of the production table lets Vite
 *     tree-shake the procedural generators; they are not demand-driven.
 *
 * ### Point-source rows are `built: 'external'`
 *
 * The nine point slots (8 galaxy catalogs + Synthetic) are minted in `initGpu`
 * by `wireGalaxyCatalogSourceSlot`, alongside the renderer their commit uploads
 * into. They appear here ONLY so the demand loop can trigger their
 * already-minted slots with the right `req(tier)`; the slot-construction pass
 * skips them (`built: 'external'`). Their `factory` is a guard that throws if
 * the builder ever calls it — the row is demand+req only. See `AssetWiringRow`
 * for the rationale on this marker over the alternatives.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { createFilamentSlot } from '../../loading/slots/filamentSlot';
import { createFamousMetaSlot } from '../../loading/slots/famousMetaSlot';
import { createStructureCatalogSlot } from '../../loading/slots/structureCatalogSlot';
import { createCf4DensitySlot } from '../../loading/slots/cf4DensitySlot';
import { createFlowFieldSlot } from '../../loading/slots/flowFieldSlot';
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
import { createPgcAliasSlot } from '../../loading/slots/pgcAliasSlot';
import { createStarCatalogSlot } from '../../loading/slots/starCatalogSlot';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { ALL_BODY_TEXTURE_KEYS } from '../../../data/bodies/bodyTextureKeys';
import { BODY_TEXTURE_REGISTRY } from '../../../data/bodies/bodyTextureRegistry';
import { clampTier } from '../../../utils/math/clampTier';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { hostBodyId } from '../../../utils/scene/hostBodyId';
import { bodyTextureSlotKey } from '../../../utils/scene/bodyTextureSlotKey';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { loadRadiusMpc } from '../frame/bodyTextureLoadRadius';
import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StarCatalogId } from '../../../@types/data/starCatalog/StarCatalogId';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import type { BodyTextureKey } from '../../../@types/data/BodyTextureKey';
import type { TextureKind } from '../../../@types/data/TextureKind';
import type { Tier } from '../../../@types/data/Tier';
import type { Vec3 } from '../../../@types/math/Vec3';

/**
 * The categories backed by the bulk `.ccat` catalog — their visibility
 * gates the structure-catalog fetch. `famousGalaxy` is excluded (Famous
 * `.bin` + meta sidecar), and `group` is excluded (seed-only, no `.ccat`
 * — adding it here would trigger a pointless fetch when group visibility
 * toggles). Spelled as `StructureId` members so a type error
 * surfaces here rather than silently skipping a category on rename.
 */
const BULK_CATALOG_CATEGORIES: readonly StructureId[] = ['cluster', 'supercluster', 'void'];

/**
 * Volume-field ids, read from the registry rather than re-spelled, so
 * the demand predicates can't drift from the strings the renderer + settings
 * actually key on.
 */
const CF4_FIELD = SOURCE_REGISTRY[Source.Cf4Density].id;
const MCPM_FIELD = SOURCE_REGISTRY[Source.Mcpm].id;

/**
 * Guard factory for `built: 'external'` rows. Reaching it means the slot
 * builder forgot to honour the skip marker — a wiring bug, not a runtime path.
 */
const externalFactory = (): never => {
  throw new Error(
    'assetWiring: point-source slots are minted in initGpu (built: "external"); the registry must not build them',
  );
};

/** One demand+req row for a point source, marked as externally built. */
function pointRow(source: SourceType): AssetWiringRow {
  // The source → galaxy-catalog-id registry mapping is resolved once at row
  // construction, like the volume-field handles above. The items record is
  // keyed by GalaxyCatalogId but the cast comes from the broader SourceType, so the
  // optional chain is the runtime guard for a non-galaxy catalog code.
  const id = SOURCE_REGISTRY[source].id as GalaxyCatalogId;
  return {
    key: source,
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({ source, tier }),
    demand: (ctx) => ctx.settings.galaxyCatalogs.items[id]?.enabled === true,
  };
}

/**
 * Star-catalog sources, derived from the registry's `type: 'starCatalog'` rows
 * rather than re-spelled, so a future famous-star catalog joins the demand
 * table automatically — the same auto-widening `STAR_CATALOG_IDS` gives the
 * settings key domain. `code` is the numeric `Source` twin of each row (it IS
 * a `SourceType` at the entry literal; the union type widens it to `number`
 * once read through `SOURCE_ENTRIES`, so the cast re-narrows it).
 */
const STAR_CATALOG_SOURCES: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'starCatalog',
).map((e) => e.code);

/**
 * One demand+req row for a star catalog. Unlike the galaxy `pointRow` family,
 * these are registry-built (no `built: 'external'`): `createStarCatalogSlot`
 * null-guards the `starCatalogRenderer` handle at commit time, so the slot
 * needs no `initGpu` co-minting. Demand is the source-type-cluster gate — the
 * coarse `starCatalogs.enabled` master AND the per-catalog `items[id].enabled`
 * bit, mirroring the galaxy/structure/volume clusters. Tier reload is inherent:
 * `reevaluateDemand` re-issues `req(newTier)` on any state change.
 */
function starCatalogRow(source: SourceType): AssetWiringRow {
  const id = SOURCE_REGISTRY[source].id as StarCatalogId;
  return {
    key: source,
    factory: (deps) => createStarCatalogSlot(source, deps.state, deps.cb),
    req: (tier) => ({ source, tier }),
    demand: (ctx) =>
      ctx.settings.starCatalogs.enabled && ctx.settings.starCatalogs.items[id]?.enabled === true,
  };
}

/**
 * The host body's world position at the frame's LIVE sim instant. The texture
 * proximity gates read a host body's world position; every host is an orbital
 * body that MOVES, so its position comes from `deriveBodyStates(simDays)` — the
 * same memoized source the render layers read — evaluated at the instant carried
 * on `DemandCtx.simDays` (the last frame's `cameraRuntime.lastRenderedSimDays`),
 * not a baked epoch. A paused clock re-reads the same memoized snapshot for free;
 * a tick re-derives the ~22 Kepler solves once and every proximity row shares it.
 * The ring rides its host body's position.
 */
function bodyPosOf(id: BodyTextureId | RingTextureId, simDays: number): Readonly<Vec3> {
  const hostId = hostBodyId(id);
  const state = deriveBodyStates(simDays).get(hostId);
  if (state === undefined) {
    throw new Error(`bodyPosOf: texture host '${hostId}' has no derived body state`);
  }
  return state.positionMpc;
}

/**
 * The body's per-`kind` tier ceiling from the texture registry (the ring's is
 * its host's). Every family entry in `ALL_BODY_TEXTURE_KEYS` is enumerated from a
 * present `kinds` key, so the lookup is total — the assertion encodes that
 * invariant rather than widening the return to `Tier | undefined`.
 */
function ceilingOf(id: BodyTextureId | RingTextureId, kind: TextureKind): Tier {
  return BODY_TEXTURE_REGISTRY[hostBodyId(id)].kinds[kind]!;
}

/**
 * One demand+release row for a body-surface texture, generated per family key,
 * mirroring `pointRow`: `built: 'external'` (minted in `initGpu` next to the
 * body renderer), demand+req only here. The slot is DEMANDED once the camera
 * closes inside the body's own load radius and RELEASED once it retreats past
 * twice that radius. `release` is separate from `!demand` on purpose — the band
 * between `X` and `2X` is the hysteresis gap where neither fires, so a camera
 * dithering at the boundary never thrashes a multi-MB texture load/free cycle
 * (see `AssetWiringRow`). `req` clamps the current tier to the `(body, kind)`
 * ceiling so a body that only ships a `small` texture is never asked for a
 * `large` one. The row's `key` is the composite `bodyTextureSlotKey`, matching
 * the slot Map + `AssetKey`; the demand/release gates read `entry.bodyId` (the
 * ring rides its host body).
 */
function bodyTextureRow(entry: BodyTextureKey): AssetWiringRow {
  return {
    key: bodyTextureSlotKey(entry.bodyId, entry.kind),
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({
      bodyId: entry.bodyId,
      kind: entry.kind,
      tier: clampTier(tier, ceilingOf(entry.bodyId, entry.kind)),
    }),
    demand: (ctx) =>
      distanceMpc(ctx.cameraPosMpc, bodyPosOf(entry.bodyId, ctx.simDays)) <
      loadRadiusMpc(entry.bodyId),
    release: (ctx) =>
      distanceMpc(ctx.cameraPosMpc, bodyPosOf(entry.bodyId, ctx.simDays)) >
      2 * loadRadiusMpc(entry.bodyId),
  };
}

export const ASSET_WIRING: readonly AssetWiringRow[] = [
  // ── Point sources (demand+req only; slots minted in initGpu) ──────
  pointRow(Source.SDSS),
  pointRow(Source.TwoMRS),
  pointRow(Source.Glade),
  pointRow(Source.Milliquas),
  pointRow(Source.FamousGalaxy),
  pointRow(Source.DesiDeep),
  pointRow(Source.DesiWedge),
  pointRow(Source.DesiSgw),
  {
    // Synthetic fallback: loads only when armed by `createSyntheticFallback`,
    // which runs the precise gate (count-aware, hidden-at-boot-aware) at the
    // slot-subscription level and trips the `'syntheticFallback'` request flag.
    // A pure ctx predicate can't express that gate — see createSyntheticFallback.
    key: Source.Synthetic,
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({ source: Source.Synthetic, tier }),
    demand: (ctx) => ctx.request('syntheticFallback'),
  },

  // ── Famous-galaxy meta sidecar ───────────────────────────────────
  // Companion join: loads once the Famous slot leaves `idle` (i.e. the
  // .bin fetch has begun), so the InfoCard text rides in alongside the
  // binary rather than racing ahead of it.
  {
    key: 'famousMeta',
    factory: (deps) => createFamousMetaSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.slotState(Source.FamousGalaxy) !== 'idle',
  },

  // ── Cosmic-web filament skeleton ─────────────────────────────────
  // Bug-fix pin: gates on the real master toggle.
  {
    key: 'filaments',
    factory: (deps) => createFilamentSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.settings.filaments.enabled,
  },

  // ── MCPM Cosmic Web volume ───────────────────────────────────────
  // Tier-aware. Field id read from the registry; access is optional-chained
  // because `state.settings.volumes.items` has no entry for a field until it is seeded.
  {
    key: 'mcpm',
    factory: (deps) => createMcpmSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.settings.volumes.items[MCPM_FIELD]?.enabled === true,
  },

  // ── CF-4 DM density volume ───────────────────────────────────────
  // Void request (the cube isn't tiered or per-source). Default-off field.
  {
    key: 'cf4Density',
    factory: (deps) => createCf4DensitySlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.volumes.items[CF4_FIELD]?.enabled === true,
  },

  // ── CF4++ velocity flow field ────────────────────────────────────
  // Default-off, single tier-agnostic .scfd. Loads on first enable
  // (the flow layer's master gate), like cf4Density. Flow is a singleton
  // overlay layer, so its gate lives in `settings.flow.enabled` alongside
  // filaments/milkyWay — no bespoke DemandCtx surface. The GPU upload +
  // renderer handoff land in Phase C.
  {
    key: 'flow',
    factory: (deps) => createFlowFieldSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.flow.enabled,
  },

  // ── Cluster/supercluster bulk coverage ───────────────────────────
  // Bug-fix pin (structures-enabled proxy): loads when ANY structure
  // category is visible in either the marker or label overlay. Empty
  // request — the .ccat is a standalone boot asset.
  {
    key: 'structureCatalog',
    factory: (deps) => createStructureCatalogSlot(deps.state, deps.cb),
    req: () => ({}),
    demand: (ctx) =>
      BULK_CATALOG_CATEGORIES.some(
        (cat) =>
          ctx.settings.structures.items[cat].enabled ||
          ctx.settings.structures.items[cat].labelEnabled,
      ),
  },

  // ── PGC alias map ────────────────────────────────────────────────
  // Lazy: only the one-shot `paletteOpened` request triggers it.
  {
    key: 'pgcAlias',
    factory: (deps) => createPgcAliasSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.request('paletteOpened'),
  },

  // ── Body-surface textures (proximity-demanded + released) ────────
  // One row per textured body + the Saturn ring, each minted in initGpu
  // (`built: 'external'`) and gated on the camera closing inside that body's
  // own load radius — the proximity family that replaces Earth's bespoke
  // descent-gated texture. See `bodyTextureRow` for the hysteresis rationale.
  ...ALL_BODY_TEXTURE_KEYS.map(bodyTextureRow),

  // ── Survey star catalogs (Gaia bin today) ────────────────────────
  // Per-source, tier-aware, registry-built. One row per `type: 'starCatalog'`
  // registry entry; a new star catalog joins the table with no edit here.
  ...STAR_CATALOG_SOURCES.map(starCatalogRow),
];
