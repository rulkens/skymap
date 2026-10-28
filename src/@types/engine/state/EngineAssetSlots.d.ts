/**
 * EngineAssetSlots — core's own asset slots: the mesh body family, kept beside the
 * one mesh renderer every body-bearing Layer draws through. A Layer's slots live in
 * `state.layerSlots`. Each slot's race-checked `commit` is the structural fix for
 * tier-swap stomping: a stale load can no longer overwrite a newer one. The Map is
 * declared empty and needs no null check; a 404 or decode failure surfaces as a
 * commit that never fires, never as an error path.
 */

import type { AssetSlot } from '../../loading/AssetSlot';
import type { MeshAsset } from '../../data/mesh/MeshAsset';
import type { MeshReq } from '../../loading/MeshReq';

export type EngineAssetSlots = {
  /**
   * One slot per `MESH_PRESENTATIONS` entry, keyed by the body's own id: one fetch
   * resolves the whole `MeshAsset`. Proximity-gated: demanded inside
   * `meshBodyLoadRadius`'s radius, released past twice it.
   */
  meshBodies: Map<string, AssetSlot<MeshAsset, MeshReq>>;
};
