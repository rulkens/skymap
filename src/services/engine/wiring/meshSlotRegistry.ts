/**
 * meshSlotRegistry — mints the `meshBodies` slot family, one `AssetSlot` per
 * `SCENE_MESH_BODIES` entry. Un-keyed, unlike `bodyTextureSlotRegistry.ts`: one
 * fetch resolves a mesh body's whole `MeshAsset` (geometry + three textures).
 */

import { createAssetSlot } from '../../loading/AssetSlot';
import { meshFetcher } from '../../loading/fetchers/meshFetcher';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';

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
      commit: async (asset) => state.gpu.meshBodyRenderer?.setMesh(body.id, asset),
      onRelease: () => state.gpu.meshBodyRenderer?.clearMesh(body.id),
    });
    state.assetSlots.meshBodies.set(body.id, slot);
  }
}
