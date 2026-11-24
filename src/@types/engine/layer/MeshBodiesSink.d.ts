import type { MeshAsset } from '../../data/mesh/MeshAsset';
import type { SceneBodyId } from '../../scene/SceneBodyId';

/** Core's one mesh renderer, as the two calls an asset slot makes. Safe before the renderer exists. */
export type MeshBodiesSink = {
  readonly setMesh: (id: SceneBodyId, asset: MeshAsset) => void;
  readonly clearMesh: (id: SceneBodyId) => void;
};
