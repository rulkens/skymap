/**
 * meshAssetRows — core's asset rows: one per mesh body, each carrying the slot it
 * mints (the mesh slots stay core's, beside the one mesh renderer every
 * body-bearing Layer draws through). `createLayers` folds these with every Layer's
 * rows into `state.assetRows`. `evaluateAssetDemand` re-reads every row's demand whole
 * each pass, so no edge can be missed.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import { createAssetSlot } from '../../loading/AssetSlot';
import { meshFetcher } from '../../loading/fetchers/meshFetcher';
import { MESH_PRESENTATIONS } from '../../../data/bodies/meshPresentations';
import { MESH_ASSETS } from '../../../data/bodies/meshAssets.generated';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { clampTier } from '../../../utils/math/clampTier';
import { closeMeshAssetBitmaps } from '../../../utils/meshBodies/closeMeshAssetBitmaps';
import { meshBodySlotKey } from '../../../utils/meshBodies/meshBodySlotKey';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';

/** One row per mesh body: loads when it is `resolvePx` across (where its glint hands over), releases below half that. */
function meshBodyRow(state: Pick<EngineState, 'gpu'>, body: MeshPresentation): AssetWiringRow {
  const { resolvePx } = findByIdOrThrow(SCENE_BODIES, body.id, 'meshBodyRow');
  // A generated mesh has no baked tiers to clamp to.
  const ceiling = MESH_ASSETS[body.meshKey]?.tierCeiling;
  return {
    key: meshBodySlotKey(body.id),
    // `commit`/`onRelease` re-read `state.gpu.meshBodyRenderer` at call time, so the
    // slot can be minted before that renderer exists.
    slot: createAssetSlot<MeshAsset, MeshReq>({
      name: `${body.id}-mesh`,
      fetch: body.buildMesh ?? meshFetcher,
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
      tier: ceiling === undefined ? tier : clampTier(tier, ceiling),
    }),
    demand: { size: { body: body.id, loadPx: resolvePx, releasePx: resolvePx / 2 } },
    priority: 10, // same rank as body textures — rarely co-demanded with the planet family
  };
}

export function meshAssetRows(state: Pick<EngineState, 'gpu'>): readonly AssetWiringRow[] {
  return MESH_PRESENTATIONS.map((body) => meshBodyRow(state, body));
}
