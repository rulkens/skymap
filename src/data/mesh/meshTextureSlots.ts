/**
 * meshTextureSlots — the baked material maps of a mesh body: the bind-group
 * binding the shader reads each at, and the `<key><suffix>.webp` the bake
 * writes and the fetcher asks for. Only albedo is sRGB: a metal-rough or normal
 * map decoded through sRGB returns wrong roughness and wrong slopes.
 */

import type { MeshTextureField } from '../../@types/data/mesh/MeshTextureField';

export const MESH_TEXTURE_SLOTS = [
  { field: 'albedo', binding: 2, format: 'rgba8unorm-srgb', suffix: '_albedo' },
  { field: 'metalRough', binding: 3, format: 'rgba8unorm', suffix: '_mr' },
  { field: 'normalMap', binding: 4, format: 'rgba8unorm', suffix: '_normal' },
] as const satisfies readonly {
  field: MeshTextureField;
  binding: number;
  format: GPUTextureFormat;
  suffix: string;
}[];
