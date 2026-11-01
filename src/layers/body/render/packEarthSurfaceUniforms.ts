/**
 * packEarthSurfaceUniforms: packer for the 128-byte `EarthSurfaceUniforms` struct
 * (`shaders/lib/sphere.wesl` holds the layout table; drift is silent on the GPU).
 * Reuses `packLitBodyUniforms` for f32 0..19, then overwrites the lit pad at 19
 * with `roughnessBase`. `ambientLight` and `oceanRoughness` are Earth-scoped
 * overrides of the `AMBIENT` and `OCEAN_ROUGHNESS` consts. Indices 29..31 are
 * zeroed padding.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of the uniform struct. */
export const EARTH_SURFACE_UNIFORM_FLOATS = 32;

export function packEarthSurfaceUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  roughnessBase: number,
  f0: number,
  sunIrradiance: number,
  cloudShadowStrength: number,
  cloudShellRadius: number,
  ambientLight: number,
  oceanRoughness: number,
): Float32Array {
  const out = new Float32Array(EARTH_SURFACE_UNIFORM_FLOATS);
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // f32 0..19
  out[19] = roughnessBase; // byte 76 — overwrite the lit pad with a real field
  out[20] = camPosLocal[0]; // byte 80 — vec3, 16-byte aligned
  out[21] = camPosLocal[1]; // byte 84
  out[22] = camPosLocal[2]; // byte 88
  out[23] = f0; // byte 92 — fills camPosLocal's vec3 tail
  out[24] = sunIrradiance; // byte 96
  out[25] = cloudShadowStrength; // byte 100
  out[26] = cloudShellRadius; // byte 104 — the shadow shell's local radius
  out[27] = ambientLight; // byte 108 — night-side floor, fills the former pad
  out[28] = oceanRoughness; // byte 112 — open-water GGX roughness, new 16-byte row
  // Indices 29..31 stay the Float32Array's zero fill (true padding).
  return out;
}
