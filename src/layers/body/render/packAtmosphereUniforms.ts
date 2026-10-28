/**
 * packAtmosphereUniforms: packer for the 176-byte `AtmosphereUniforms` struct
 * (`shaders/lib/sphere.wesl` holds the layout table and the atmosphere-top
 * unit-sphere convention). Reuses `packLitBodyUniforms` for f32 0..19, then
 * overwrites the lit pad at 19 with `bottomRadius`
 * (`planetRadiusKm / atmosphereTopKm`, in (0,1)). `camPosLocal` is in
 * atmosphere-top units; `invMvp` is packed for every body. `ringOuterRatio == 0`
 * means no ring.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of the uniform struct. */
export const ATMOSPHERE_UNIFORM_FLOATS = 44;

export function packAtmosphereUniforms(
  mvp: Float32Array,
  invMvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  bottomRadius: number, // = planetRadiusKm / atmosphereTopKm
  exposure: number,
  ringInnerRatio: number,
  ringOuterRatio: number,
  froxelSliceKm: number,
): Float32Array {
  const out = new Float32Array(ATMOSPHERE_UNIFORM_FLOATS);
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // f32 0..19
  out[19] = bottomRadius; // byte 76 — overwrite the lit pad with a real field
  out[20] = camPosLocal[0]; // byte 80 — vec3, 16-byte aligned
  out[21] = camPosLocal[1]; // byte 84
  out[22] = camPosLocal[2]; // byte 88
  // out[23] (byte 92) stays zero — camPosLocal's vec3 tail pad.
  out[24] = exposure; // byte 96
  out[25] = ringInnerRatio; // byte 100
  out[26] = ringOuterRatio; // byte 104
  out[27] = froxelSliceKm; // byte 108 — a real field in the slot rounding the prefix to 112
  out.set(invMvp.subarray(0, 16), 28); // f32 28..43, byte 112..175
  return out;
}
