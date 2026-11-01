/**
 * packTexturedBodyUniforms: packer for the 176-byte `TexturedBodyUniforms` struct
 * (`shaders/lib/sphere.wesl` holds the layout table). Reuses `packLitBodyUniforms`
 * for the 80-byte prefix so the layouts cannot drift; writes only the ring ratios
 * (`ringOuterRatio == 0` means no ring), the Minnaert params (`limbStrength == 0`
 * is the identity), `camPosLocal`, and the contact-range depth pair
 * (`camAltitudeSq`, `vpCamRelLocal`; see `lib/analyticSphere.wesl`).
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of the uniform struct. */
export const TEXTURED_BODY_UNIFORM_FLOATS = 44;

export function packTexturedBodyUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  ringInnerRatio: number,
  ringOuterRatio: number,
  limbStrength: number,
  limbExponent: number,
  camPosLocal: Readonly<Vec3>,
  camAltitudeSq: number,
  vpCamRelLocal: Float32Array,
): Float32Array {
  const out = new Float32Array(TEXTURED_BODY_UNIFORM_FLOATS);
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // bytes 0..79
  out[20] = ringInnerRatio; // byte 80
  out[21] = ringOuterRatio; // byte 84
  out[22] = limbStrength; // byte 88
  out[23] = limbExponent; // byte 92
  out[24] = camPosLocal[0]; // byte 96
  out[25] = camPosLocal[1]; // byte 100
  out[26] = camPosLocal[2]; // byte 104
  out[27] = camAltitudeSq; // byte 108
  out.set(vpCamRelLocal.subarray(0, 16), 28); // bytes 112..175
  return out;
}
