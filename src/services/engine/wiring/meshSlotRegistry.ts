/**
 * meshSlotRegistry — mints the `meshBodies` slot family, one `AssetSlot` per
 * `SCENE_MESH_BODIES` entry. Un-keyed, unlike `bodyTextureSlotRegistry.ts`: one
 * fetch resolves a mesh body's whole `MeshAsset` (geometry + three textures).
 */

import { createAssetSlot } from '../../loading/AssetSlot';
import { meshFetcher } from '../../loading/fetchers/meshFetcher';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { MESH_TEXTURE_SLOTS } from '../../../data/mesh/meshTextureSlots';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';

// Must run before `installLoadProgress` enumerates the family into `allSlots`;
// renderer construction order does not matter — `commit`/`onRelease` re-read
// `state.gpu.meshBodyRenderer`, which is null mid-bootstrap.
export function wireMeshBodySlots(state: EngineState): void {
  for (const body of SCENE_MESH_BODIES) {
    const slot = createAssetSlot<MeshAsset, MeshReq>({
      name: `${body.id}-mesh`,
      fetch: meshFetcher,
      // `setMesh` uploads every bitmap synchronously (copyExternalImageToTexture
      // + mip chain) and never retains one, so closing right after frees the
      // decoded pixels — nothing downstream reads a mesh slot's `.current()`
      // for its textures, only `meshBodyRenderer`'s own `hasMesh`/`meshes` map.
      commit: async (asset) => {
        state.gpu.meshBodyRenderer?.setMesh(body.id, asset);
        for (const textureSlot of MESH_TEXTURE_SLOTS) asset[textureSlot.field].close();
        asset.contactShadow?.close();
      },
      onRelease: () => state.gpu.meshBodyRenderer?.clearMesh(body.id),
    });
    state.assetSlots.meshBodies.set(body.id, slot);
  }
}
