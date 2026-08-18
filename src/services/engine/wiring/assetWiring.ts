/**
 * ASSET_WIRING — the flat registry of every fetchable asset's lifecycle contract
 * (`key` + `factory` + `req` + `demand`), iterated by `wireSlots` to build the slot
 * table and by `reevaluateDemand` to decide what loads now. Each row's `demand(ctx)`
 * is a pure predicate over `DemandCtx`, re-run whole on any state change, so no edge
 * (tier flip while hidden, toggle mid-flight) can be missed. `built: 'external'` rows
 * are minted in `wireSlots` and appear here only for demand + `req(tier)`; their
 * `factory` throws if the construction pass calls it. The DEV synthetic volumes are
 * absent so Vite tree-shakes the generators.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { createFilamentSlot } from '../../loading/slots/filamentSlot';
import { createFamousGalaxiesMetaSlot } from '../../loading/slots/famousGalaxiesMetaSlot';
import { createFamousStarsMetaSlot } from '../../loading/slots/famousStarsMetaSlot';
import { createStructureCatalogSlot } from '../../loading/slots/structureCatalogSlot';
import { createCf4DensitySlot } from '../../loading/slots/cf4DensitySlot';
import { createPolyphormSlot } from '../../loading/slots/polyphormSlot';
import { createFlowFieldSlot } from '../../loading/slots/flowFieldSlot';
import { createConstellationsSlot } from '../../loading/slots/constellationsSlot';
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
import { createPgcAliasSlot } from '../../loading/slots/pgcAliasSlot';
import { createStarCatalogSlot } from '../../loading/slots/starCatalogSlot';
import { createBodyTextureAtlasSlot } from '../../loading/slots/bodyTextureAtlasSlot';
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
 * The categories backed by the bulk `.ccat` — their visibility gates its fetch.
 * `famousGalaxy` (own `.bin`) and `group` (seed-only, no `.ccat`) are excluded;
 * adding `group` here would fetch the catalog whenever group visibility toggles.
 */
const BULK_CATALOG_CATEGORIES: readonly StructureId[] = ['cluster', 'supercluster', 'void'];

/**
 * Read from the registry, not re-spelled, so the demand predicates cannot drift
 * from the strings the renderer and settings key on.
 */
const CF4_FIELD = SOURCE_REGISTRY[Source.Cf4Density].id;
const MCPM_FIELD = SOURCE_REGISTRY[Source.Mcpm].id;
const POLYPHORM_FIELD = SOURCE_REGISTRY[Source.Polyphorm].id;

/** Reaching this means the slot builder ignored `built: 'external'` — a wiring bug. */
const externalFactory = (): never => {
  throw new Error(
    'assetWiring: externally-built rows (built: "external" — point sources, body textures) are minted outside this registry; the construction pass must not build them',
  );
};

/**
 * One demand+req row for a point source. `priority` is a parameter because the
 * galaxy catalogs do NOT share a rank — see the fetch-rank note below.
 */
function pointRow(source: SourceType, priority: number): AssetWiringRow {
  // The items record is keyed by GalaxyCatalogId but the cast widens from
  // SourceType, so the optional chain guards a non-galaxy catalog code at runtime.
  const id = SOURCE_REGISTRY[source].id as GalaxyCatalogId;
  return {
    key: source,
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({ source, tier }),
    demand: (ctx) => ctx.settings.galaxyCatalogs.items[id]?.enabled === true,
    priority,
  };
}

/**
 * Star-catalog sources that actually ship an asset. A SEEDED catalog
 * (`binBaseName: null`) is built in code, so including it would have the fetcher
 * request a filename assembled from a null stem. The cast re-narrows `code`.
 */
const STAR_CATALOG_SOURCES: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'starCatalog' && e.binBaseName !== null,
).map((e) => e.code);

/**
 * One demand+req row for a star catalog. Registry-built, unlike the galaxy
 * `pointRow` family: `createStarCatalogSlot` null-guards the renderer handle at
 * commit time, so the slot needs no external co-minting.
 */
function starCatalogRow(source: SourceType): AssetWiringRow {
  const id = SOURCE_REGISTRY[source].id as StarCatalogId;
  return {
    key: source,
    factory: (deps) => createStarCatalogSlot(source, deps.state, deps.cb),
    req: (tier) => ({ source, tier }),
    demand: (ctx) =>
      ctx.settings.starCatalogs.enabled && ctx.settings.starCatalogs.items[id]?.enabled === true,
    priority: 50, // one rank for every star catalog: the Earth boot view's own scale rung
  };
}

/**
 * The host body's world position at the frame's LIVE sim instant — every host
 * MOVES, so this must come from `deriveBodyStates(ctx.simDays)` (the memoized source
 * the render layers read), never a baked epoch. A paused clock re-reads the same
 * snapshot; a tick re-solves the ~22 Kepler orbits once for all proximity rows.
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
 * The per-`kind` tier ceiling (a ring's is its host's). `ALL_BODY_TEXTURE_KEYS` is
 * enumerated from present `kinds` keys, so the lookup is total — hence the `!`.
 */
function ceilingOf(id: BodyTextureId | RingTextureId, kind: TextureKind): Tier {
  return BODY_TEXTURE_REGISTRY[hostBodyId(id)].kinds[kind]!;
}

/**
 * One demand+release row per body-texture family key. DEMANDED inside the body's
 * load radius, RELEASED past twice it: `release` is deliberately not `!demand`, and
 * the band between `X` and `2X` where neither fires is the hysteresis that stops a
 * camera dithering at the boundary from thrashing a multi-MB load/free cycle. `req`
 * clamps the tier to the `(body, kind)` ceiling.
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
    priority: 10, // one rank for the family; they are rarely co-demanded with each other
  };
}

/**
 * Fetch ranks (`priority`, lower first). Array order below is grouped for READING and
 * differs from fetch order on purpose. The bulk-survey ranks 60–65 are DISTINCT
 * because `popHighestPriority` breaks ties by first-encountered: equal ranks would
 * fall back to array order and fetch GLADE (26 MB) before Milliquas (12.8 MB), the
 * large-before-small order the ranking exists to prevent. Two ranks look wrong and
 * are deliberate — famous galaxies (20) and 2MRS (40) both outrank the star catalog
 * (50); Famous is the codebase's only `surveyDeepZoom` exemption, so it is the one
 * galaxy asset that draws at the boot rung, and 2MRS buys resident local structure
 * for about a second of stars-arrive-later.
 */
export const ASSET_WIRING: readonly AssetWiringRow[] = [
  // ── Low-resolution all-bodies surface atlas ──────────────────────
  // Rank 0 and deliberately NOT proximity-gated: it is the universal fallback the
  // per-body rows upgrade, so gating it would reinstate the "body reached before its
  // texture" gap it closes. Registry-built — its commit fans out to several renderers,
  // so there is none to co-mint it beside.
  {
    key: 'bodyTextureAtlas',
    factory: (deps) => createBodyTextureAtlasSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: () => true,
    priority: 0,
  },

  // ── Point sources (demand+req only; slots minted in wireSlots) ──────
  pointRow(Source.SDSS, 60),
  pointRow(Source.TwoMRS, 40),
  pointRow(Source.Glade, 62),
  pointRow(Source.Milliquas, 61),
  pointRow(Source.FamousGalaxy, 20),
  pointRow(Source.DesiDeep, 63),
  pointRow(Source.DesiWedge, 65),
  pointRow(Source.DesiSgw, 64),
  {
    // Armed by `createSyntheticFallback`, whose count-aware, hidden-at-boot-aware
    // gate no pure ctx predicate can express; it trips the request flag instead.
    key: Source.Synthetic,
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({ source: Source.Synthetic, tier }),
    demand: (ctx) => ctx.request('syntheticFallback'),
    // Ahead of everything real: only demanded when the real catalogs failed.
    priority: 5,
  },

  // ── Famous-galaxy meta sidecar ───────────────────────────────────
  // Companion join: loads once the Famous slot leaves `idle`, so the InfoCard text
  // rides in alongside the binary rather than racing ahead of it.
  {
    key: 'famousGalaxiesMeta',
    factory: (deps) => createFamousGalaxiesMetaSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.slotState(Source.FamousGalaxy) !== 'idle',
    priority: 21, // immediately behind its .bin (20), never overtaking it
  },

  // ── Famous-star meta sidecar ──────────────────────────────────────
  // Unconditional rather than a companion join: the famous stars are a seeded
  // catalog compiled into the bundle, so there is no sibling `.bin` to key demand off.
  {
    key: 'famousStarsMeta',
    factory: (deps) => createFamousStarsMetaSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: () => true,
    priority: 22, // right behind famousGalaxiesMeta; both are tiny and wanted early
  },

  // ── Cosmic-web filament skeleton ─────────────────────────────────
  {
    key: 'filaments',
    factory: (deps) => createFilamentSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.settings.filaments.enabled,
    priority: 80, // cosmic-web overlays sit behind the catalogs they are drawn over
  },

  // ── MCPM Cosmic Web volume ───────────────────────────────────────
  // Optional-chained because `settings.volumes.items` has no entry for a field
  // until it is seeded.
  {
    key: 'mcpm',
    factory: (deps) => createMcpmSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.settings.volumes.items[MCPM_FIELD]?.enabled === true,
    priority: 70, // the largest single boot payload, and it only reads at the widest rung
  },

  // ── CF-4 DM density volume ───────────────────────────────────────
  // Void request: the cube is neither tiered nor per-source.
  {
    key: 'cf4Density',
    factory: (deps) => createCf4DensitySlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.volumes.items[CF4_FIELD]?.enabled === true,
    priority: 82, // last of the cosmic-web overlays; default-off, so it rarely competes at boot
  },

  // ── Polyphorm 2MRS density volume ─────────────────────────────────
  // Void request: the cube is neither tiered nor per-source, like CF-4.
  {
    key: 'polyphorm',
    factory: (deps) => createPolyphormSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.volumes.items[POLYPHORM_FIELD]?.enabled === true,
    priority: 82, // same rung as cf4Density; default-off, so it rarely competes at boot
  },

  // ── CF4++ velocity flow field ────────────────────────────────────
  // A singleton overlay layer, so its gate lives in `settings.flow.enabled`
  // alongside filaments/milkyWay rather than on a bespoke DemandCtx surface.
  {
    key: 'flow',
    factory: (deps) => createFlowFieldSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.flow.enabled,
    priority: 81, // same rung as filaments, behind them by size
  },

  // ── Constellation stick-figure overlay ───────────────────────────
  // Master-gate demand, the singleton-overlay convention shared with filaments/flow.
  {
    key: 'constellations',
    factory: (deps) => createConstellationsSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.constellations.enabled,
    priority: 31, // small JSON on the near-sky rung, right behind the marker catalog
  },

  // ── Cluster/supercluster bulk coverage ───────────────────────────
  // The structures-enabled proxy: loads when ANY bulk category has its ring OR its
  // label on, both axes read from the per-category item rows.
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
    priority: 30, // a small .ccat that draws across many rungs at once — high value per byte
  },

  // ── PGC alias map ────────────────────────────────────────────────
  // Lazy: only the one-shot `paletteOpened` request triggers it.
  {
    key: 'pgcAlias',
    factory: (deps) => createPgcAliasSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.request('paletteOpened'),
    priority: 90, // last: nothing renders from it, and its one-shot trigger tolerates a wait
  },

  // ── Body-surface textures (proximity-demanded + released) ────────
  ...ALL_BODY_TEXTURE_KEYS.map(bodyTextureRow),

  // ── Survey star catalogs ─────────────────────────────────────────
  // One row per `type: 'starCatalog'` entry, so a new catalog joins with no edit here.
  ...STAR_CATALOG_SOURCES.map(starCatalogRow),
];
