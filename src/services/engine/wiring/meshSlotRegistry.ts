/**
 * meshSlotRegistry — mints the `meshBodies` slot family, one `AssetSlot` per
 * `MESH_PRESENTATIONS` entry. Un-keyed, unlike `bodyTextureSlotRegistry.ts`: one
 * fetch resolves a mesh body's whole `MeshAsset` (geometry + three textures).
 */

import { createAssetSlot } from '../../loading/AssetSlot';
import { meshFetcher } from '../../loading/fetchers/meshFetcher';
import { MESH_PRESENTATIONS } from '../../../data/bodies/meshPresentations';
import { closeMeshAssetBitmaps } from '../../../utils/meshBodies/closeMeshAssetBitmaps';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';

// Must run before `installLoadProgress` enumerates the family into `allSlots`;
// renderer construction order does not matter — `commit`/`onRelease` re-read
// `state.gpu.meshBodyRenderer`, which is null mid-bootstrap.
export function wireMeshBodySlots(state: EngineState): void {
  for (const body of MESH_PRESENTATIONS) {
    const slot = createAssetSlot<MeshAsset, MeshReq>({
      name: `${body.id}-mesh`,
      fetch: meshFetcher,
      // `setMesh` copies every bitmap into its own texture; close the decoded copies.
      commit: async (asset) => {
        state.gpu.meshBodyRenderer?.setMesh(body.id, asset);
        closeMeshAssetBitmaps(asset);
      },
      dispose: closeMeshAssetBitmaps,
      onRelease: () => state.gpu.meshBodyRenderer?.clearMesh(body.id),
    });
    state.assetSlots.meshBodies.set(body.id, slot);
  }
}
