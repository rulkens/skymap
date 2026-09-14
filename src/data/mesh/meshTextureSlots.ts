/**
 * meshTextureSlots — the three baked material maps of a mesh body, each with the
 * bind-group binding the shader reads it at. Only albedo is sRGB: a metal-rough
 * or normal map decoded through sRGB returns wrong roughness and wrong slopes.
 */

import type { MeshAsset } from '../../@types/data/mesh/MeshAsset';

export const MESH_TEXTURE_SLOTS = [
  { field: 'albedo', binding: 2, format: 'rgba8unorm-srgb' },
  { field: 'metalRough', binding: 3, format: 'rgba8unorm' },
  { field: 'normalMap', binding: 4, format: 'rgba8unorm' },
] as const satisfies readonly {
  field: keyof MeshAsset;
  binding: number;
  format: GPUTextureFormat;
}[];
