/**
 * MeshPresentation — a scene body that DRAWS as a mesh (baked or generated), whichever table
 * (mission or celestial) its identity lives in. `id` keys slot, renderer, state and pick.
 */
import type { MeshAsset } from '../data/mesh/MeshAsset';
import type { Tier } from '../../../packages/shared/src/@types/data/Tier';
import type { SceneBodyId } from './SceneBodyId';

export type MeshPresentation = {
  readonly id: SceneBodyId;
  readonly meshKey: string;
  /** Baked bounding sphere, metres — the pick proxy. */
  readonly boundingRadiusM: number;
  /** See `MeshBody.buildMesh`. */
  readonly buildMesh?: () => Promise<MeshAsset>;
  /** The body's own `resolvePx`: the mesh loads where its glint hands over. */
  readonly resolvePx: number;
  /** See `MeshBody.tierCeiling`. */
  readonly tierCeiling?: Tier;
};
