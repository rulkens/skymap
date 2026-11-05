/**
 * meshAssetRows — core's asset rows: one per mesh body, each carrying the slot it
 * mints (the mesh slots stay core's, beside the one mesh renderer every
 * body-bearing Layer draws through). `createLayers` folds these with every Layer's
 * rows into `state.assetRows`. Each `demand(ctx)` is a pure predicate over
 * `DemandCtx`, re-run whole on any state change, so no edge can be missed.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import { createAssetSlot } from '../../loading/AssetSlot';
import { meshFetcher } from '../../loading/fetchers/meshFetcher';
import { MESH_PRESENTATIONS } from '../../../data/bodies/meshPresentations';
import { MESH_ASSETS } from '../../../data/bodies/meshAssets.generated';
import { clampTier } from '../../../utils/math/clampTier';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { closeMeshAssetBitmaps } from '../../../utils/meshBodies/closeMeshAssetBitmaps';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { loadRadiusMpc as meshBodyLoadRadiusMpc } from '../frame/meshBodyLoadRadius';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { meshBodySlotKey } from '../../../utils/meshBodies/meshBodySlotKey';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';

/**
 * One demand+release row per mesh body: demanded inside `loadRadiusMpc`, released
 * past twice it — the band between is the hysteresis that stops a camera dithering
 * at the boundary from thrashing a load/free cycle. A mesh body is in the body-state
 * snapshot whatever drives it, so its position comes straight off `deriveBodyStates`.
 */
function meshBodyRow(state: Pick<EngineState, 'gpu'>, body: MeshPresentation): AssetWiringRow {
  const bodyPos = (simDays: number): Readonly<Vec3> => {
    const bodyState = deriveBodyStates(simDays).get(body.id);
    if (bodyState === undefined) {
      throw new Error(`meshBodyRow: '${body.id}' has no derived body state`);
    }
    return bodyState.positionMpc;
  };
  return {
    key: meshBodySlotKey(body.id),
    // `commit`/`onRelease` re-read `state.gpu.meshBodyRenderer` at call time, so the
    // slot can be minted before that renderer exists.
    slot: createAssetSlot<MeshAsset, MeshReq>({
      name: `${body.id}-mesh`,
      fetch: meshFetcher,
      // `setMesh` copies every bitmap into its own texture; close the decoded copies.
      commit: async (asset) => {
        state.gpu.meshBodyRenderer?.setMesh(body.id, asset);
        closeMeshAssetBitmaps(asset);
      },
      dispose: closeMeshAssetBitmaps,
      onRelease: () => state.gpu.meshBodyRenderer?.clearMesh(body.id),
    }),
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

export function meshAssetRows(state: Pick<EngineState, 'gpu'>): readonly AssetWiringRow[] {
  return MESH_PRESENTATIONS.map((body) => meshBodyRow(state, body));
}
