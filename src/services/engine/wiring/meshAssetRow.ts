/**
 * meshAssetRow — the asset row each mesh-drawing Layer returns per body it presents as a mesh.
 * The Layer mints the slot; every slot commits to core's one mesh renderer through the sink.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import type { MeshBodiesSink } from '../../../@types/engine/layer/MeshBodiesSink';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';
import { createAssetSlot } from '../../../../packages/shared/src/services/loading/AssetSlot';
import { meshFetcher } from '../../loading/fetchers/meshFetcher';
import { clampTier } from '../../../utils/math/clampTier';
import { closeMeshAssetBitmaps } from '../../../utils/meshBodies/closeMeshAssetBitmaps';
import { meshBodySlotKey } from '../../../utils/meshBodies/meshBodySlotKey';

/** One mesh body's asset row: loads when it is `resolvePx` across (where its glint hands over), releases below half that. */
export function meshAssetRow(
  meshBodies: MeshBodiesSink,
  presentation: MeshPresentation,
): AssetWiringRow {
  const { id, meshKey, resolvePx, tierCeiling } = presentation;
  return {
    key: meshBodySlotKey(id),
    slot: createAssetSlot<MeshAsset, MeshReq>({
      name: `${id}-mesh`,
      fetch: presentation.buildMesh ?? meshFetcher,
      // `setMesh` copies every bitmap into its own texture; close the decoded copies.
      commit: async (asset) => {
        meshBodies.setMesh(id, asset);
        closeMeshAssetBitmaps(asset);
      },
      dispose: closeMeshAssetBitmaps,
      onRelease: () => meshBodies.clearMesh(id),
    }),
    // A generated mesh has no baked tiers to clamp to.
    req: (tier) => ({
      meshKey,
      tier: tierCeiling === undefined ? tier : clampTier(tier, tierCeiling),
    }),
    demand: { size: { body: id, loadPx: resolvePx, releasePx: resolvePx / 2 } },
    // Body textures are 10, and the missions Layer is composed before the body Layer: at an
    // equal rank its craft meshes would fetch ahead of planet textures.
    priority: 11,
  };
}
