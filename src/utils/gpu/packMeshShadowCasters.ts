/**
 * packMeshShadowCasters — pure packer for the `MeshShadowCasters` struct the surface tiles read;
 * the byte layout lives once in `shaders/lib/meshShadow.wesl`'s header, written here in that
 * order. Casters past `MESH_SHADOW_GROUND_CASTERS` are dropped; unused entries stay zero.
 */

import type { MeshGroundCaster } from '../../@types/rendering/MeshGroundCaster';
import type { MeshShadowTuning } from '../../@types/settings/MeshShadowTuning';
import { MESH_SHADOW_CASTERS_BYTES } from '../../data/mesh/meshShadowCastersLayout';
import { MESH_SHADOW_GROUND_CASTERS } from '../../data/mesh/meshShadowMap';

export function packMeshShadowCasters(
  casters: readonly MeshGroundCaster[],
  tuning: MeshShadowTuning,
): ArrayBuffer {
  const bytes = new ArrayBuffer(MESH_SHADOW_CASTERS_BYTES);
  const floats = new Float32Array(bytes);
  const ints = new Int32Array(bytes);
  const used = casters.slice(0, MESH_SHADOW_GROUND_CASTERS);
  used.forEach((caster, i) => {
    floats.set(caster.lightFromEye.subarray(0, 16), i * 16); // byte i · 64
    ints[64 + i] = caster.slot; // byte 256 + 4i
  });
  ints[68] = used.length; // byte 272
  floats[69] = tuning.depthBiasTexels; // byte 276
  floats[70] = tuning.filterRadiusTexels;
  ints[71] = tuning.filterSide; // byte 284
  return bytes;
}
