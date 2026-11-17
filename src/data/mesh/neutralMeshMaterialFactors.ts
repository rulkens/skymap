import type { MeshMaterialFactors } from '../../@types/rendering/MeshMaterialFactors';

/** All ones: a baked mesh renders exactly as its maps say. */
export const NEUTRAL_MESH_MATERIAL_FACTORS: MeshMaterialFactors = {
  baseColor: [1, 1, 1],
  metallic: 1,
  roughness: 1,
};
