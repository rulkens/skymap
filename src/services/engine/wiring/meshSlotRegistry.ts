/**
 * meshSlotRegistry — mints the `meshBodies` slot family, one `AssetSlot` per
 * `SCENE_MESH_BODIES` entry. Mirrors `bodyTextureSlotRegistry.ts`'s shape but
 * un-keyed: a mesh body has exactly one fetch resolving its whole
 * `MeshAsset` (geometry + three textures), so there is no per-kind
 * sub-family to key on. `commit`/`onRelease` re-read `state.gpu.meshBodyRenderer`
 * on every call and null-guard it, since it can be null mid-bootstrap.
 */

import { createAssetSlot } from '../../loading/AssetSlot';
import { meshFetcher } from '../../loading/fetchers/meshFetcher';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';

/**
 * Mint one asset slot per `SCENE_MESH_BODIES` entry into
 * `state.assetSlots.meshBodies`. Must run before `installLoadProgress`
 * enumerates the family into `allSlots`; renderer construction order does
 * not matter.
 */
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
