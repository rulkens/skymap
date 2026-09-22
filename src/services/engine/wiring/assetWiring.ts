/**
 * ASSET_WIRING — core's half of the fetchable-asset registry, AUTHORED: companion
 * rows are folded by `createLayers`, over these plus every Layer's, into
 * `state.assetRows`. Each `demand(ctx)` is a pure predicate over `DemandCtx`, re-run
 * whole on any state change, so no edge (tier flip while hidden, toggle mid-flight)
 * can be missed. `built: 'external'` rows are minted in `wireSlots` and appear here
 * only for demand + `req(tier)`; their `factory` throws if the construction pass
 * calls it. The DEV synthetic volumes are absent so Vite tree-shakes the generators.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../../@types/loading/CompanionAssetRow';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { createStructureCatalogSlot } from '../../loading/slots/structureCatalogSlot';
import { createPolyphorm2MrsSlot } from '../../loading/slots/polyphorm2MrsSlot';
import { createMcpmWorkbenchSlot } from '../../loading/slots/mcpmWorkbenchSlot';
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
import { createBodyTextureAtlasSlot } from '../../loading/slots/bodyTextureAtlasSlot';
import { ALL_BODY_TEXTURE_KEYS } from '../../../data/bodies/bodyTextureKeys';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { BODY_TEXTURE_REGISTRY } from '../../../data/bodies/bodyTextureRegistry';
import { clampTier } from '../../../utils/math/clampTier';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { hostBodyId } from '../../../utils/bodyTextures/hostBodyId';
import { bodyTextureSlotKey } from '../../../utils/bodyTextures/bodyTextureSlotKey';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { loadRadiusMpc } from '../frame/bodyTextureLoadRadius';
import { loadRadiusMpc as meshBodyLoadRadiusMpc } from '../frame/meshBodyLoadRadius';
import { meshBodySlotKey } from '../../../utils/meshBodies/meshBodySlotKey';
import type { SourceType } from '../../../@types/data/SourceType';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import type { BodyTextureKey } from '../../../@types/data/BodyTextureKey';
import type { TextureKind } from '../../../@types/data/TextureKind';
import type { Tier } from '../../../@types/data/Tier';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { MeshBody } from '../../../@types/scene/MeshBody';

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
const MCPM_FIELD = SOURCE_REGISTRY[Source.Mcpm].id;
const POLYPHORM_2MRS_FIELD = SOURCE_REGISTRY[Source.Polyphorm2MRS].id;
const MCPM_WORKBENCH_FIELD = SOURCE_REGISTRY[Source.McpmWorkbench].id;

/** Reaching this means the slot builder ignored `built: 'external'` — a wiring bug. */
const externalFactory = (): never => {
  throw new Error(
    'assetWiring: externally-built rows (built: "external" — body textures, mesh bodies) are minted outside this registry; the construction pass must not build them',
  );
};

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
 * One demand+release row per mesh body. Same proximity hysteresis as
 * `bodyTextureRow` (demanded inside `loadRadiusMpc`, released past twice it),
 * SIMPLER: a mesh body is in the body-state snapshot whatever drives it, so its
 * position comes straight off `deriveBodyStates`, no `bodyPosOf`/`hostBodyId`
 * indirection for a ring-style host.
 */
function meshBodyRow(body: MeshBody): AssetWiringRow {
  const bodyPos = (simDays: number): Readonly<Vec3> => {
    const state = deriveBodyStates(simDays).get(body.id);
    if (state === undefined) {
      throw new Error(`meshBodyRow: '${body.id}' has no derived body state`);
    }
    return state.positionMpc;
  };
  return {
    key: meshBodySlotKey(body.id),
    built: 'external',
    factory: externalFactory,
    req: () => ({ meshKey: body.meshKey }),
    demand: (ctx) =>
      distanceMpc(ctx.cameraPosMpc, bodyPos(ctx.simDays)) < meshBodyLoadRadiusMpc(body.id),
    release: (ctx) =>
      distanceMpc(ctx.cameraPosMpc, bodyPos(ctx.simDays)) > 2 * meshBodyLoadRadiusMpc(body.id),
    priority: 10, // same rank as body textures — rarely co-demanded with the planet family
  };
}

export const ASSET_WIRING: readonly (AssetWiringRow | CompanionAssetRow)[] = [
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

  // ── Volume overlays: mcpm / polyphorm2Mrs / mcpmWorkbench ─────────
  // All three are load-once and deliberately declare no `release`: adding one
  // requires an `onRelease` that calls `volumeFieldRenderer.unload(id)`, or the
  // GPU resources it frees (volumeFieldRenderer.ts:340-344) leak on evict.
  // Optional-chained `demand` because `settings.cosmicWebDensity.items` has no
  // entry for a field until it is seeded.

  // ── MCPM Cosmic Web volume ───────────────────────────────────────
  {
    key: 'mcpm',
    factory: (deps) => createMcpmSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.settings.cosmicWebDensity.items[MCPM_FIELD]?.enabled === true,
    priority: 70, // the largest single boot payload, and it only reads at the widest rung
  },

  // ── Polyphorm 2MRS density volume ─────────────────────────────────
  // Tier-aware like MCPM (same physical quantity, same per-tier `.scfd`
  // variants), unlike the workbench export below's void request.
  {
    key: 'polyphorm2Mrs',
    factory: (deps) => createPolyphorm2MrsSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.settings.cosmicWebDensity.items[POLYPHORM_2MRS_FIELD]?.enabled === true,
    priority: 82, // last of the cosmic-web overlays; default-off, so it rarely competes at boot
  },

  // ── MCPM workbench promoted-export volume ─────────────────────────
  // Void request: one cube, no tier variants. Hidden (`visible: false`)
  // pending a promotion decision — no UI toggle exists yet, so this demand
  // predicate never fires in production, but it exists so the slot
  // machinery is symmetric with every other shippable volume.
  {
    key: 'mcpmWorkbench',
    factory: (deps) => createMcpmWorkbenchSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.cosmicWebDensity.items[MCPM_WORKBENCH_FIELD]?.enabled === true,
    priority: 82, // same rung as polyphorm2Mrs above; default-off, so it rarely competes at boot
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

  // ── Body-surface textures (proximity-demanded + released) ────────
  ...ALL_BODY_TEXTURE_KEYS.map(bodyTextureRow),

  // ── Mesh bodies (whale, petunias, …) ─────────────────────────────
  ...SCENE_MESH_BODIES.map(meshBodyRow),
];
