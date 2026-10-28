/**
 * ASSET_WIRING — core's half of the fetchable-asset registry: one row per mesh body
 * (the mesh slots stay core's, beside the one mesh renderer every body-bearing Layer
 * draws through). `createLayers` folds these with every Layer's rows into
 * `state.assetRows`. Each `demand(ctx)` is a pure predicate over `DemandCtx`, re-run
 * whole on any state change, so no edge can be missed. The slots are minted in
 * `wireSlots`, so a row's `factory` throws if the construction pass calls it.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../../@types/loading/CompanionAssetRow';
import { MESH_PRESENTATIONS } from '../../../data/bodies/meshPresentations';
import { MESH_ASSETS } from '../../../data/bodies/meshAssets.generated';
import { clampTier } from '../../../utils/math/clampTier';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { loadRadiusMpc as meshBodyLoadRadiusMpc } from '../frame/meshBodyLoadRadius';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { meshBodySlotKey } from '../../../utils/meshBodies/meshBodySlotKey';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';

/** Reaching this means the slot builder ignored `built: 'external'` — a wiring bug. */
const externalFactory = (): never => {
  throw new Error(
    'assetWiring: mesh body slots (built: "external") are minted in wireSlots; the construction pass must not build them',
  );
};

/**
 * One demand+release row per mesh body: demanded inside `loadRadiusMpc`, released
 * past twice it — the band between is the hysteresis that stops a camera dithering
 * at the boundary from thrashing a load/free cycle. A mesh body is in the body-state
 * snapshot whatever drives it, so its position comes straight off `deriveBodyStates`.
 */
function meshBodyRow(body: MeshPresentation): AssetWiringRow {
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
    req: (tier) => ({
      meshKey: body.meshKey,
      tier: clampTier(tier, MESH_ASSETS[body.meshKey]!.tierCeiling),
    }),
    // An absent craft is parked on or in Earth, which must not demand its mesh.
    demand: (ctx) =>
      spacecraftPresent(body.id, ctx.simDays) &&
      distanceMpc(ctx.cameraPosMpc, bodyPos(ctx.simDays)) < meshBodyLoadRadiusMpc(body.id),
    release: (ctx) =>
      distanceMpc(ctx.cameraPosMpc, bodyPos(ctx.simDays)) > 2 * meshBodyLoadRadiusMpc(body.id),
    priority: 10, // same rank as body textures — rarely co-demanded with the planet family
  };
}

export const ASSET_WIRING: readonly (AssetWiringRow | CompanionAssetRow)[] = [
  // ── Mesh bodies (whale, petunias, …) ─────────────────────────────
  ...MESH_PRESENTATIONS.map(meshBodyRow),
];
