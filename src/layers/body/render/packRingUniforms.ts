/**
 * packRingUniforms: packer for the 96-byte `RingUniforms` struct
 * (`shaders/lib/sphere.wesl` holds the layout table). Writes the prefix itself
 * rather than via `packLitBodyUniforms`: byte 76 is the REAL field
 * `planetRadiusRatio` (planet radius / ring OUTER radius), not a zeroed pad.
 * `camPosLocal` is in planet radii (planet = unit sphere), the frame of the
 * fragment's in-front-of-planet view-ray test. `innerRatio` is ring inner / outer.
 */

import type { Vec3 } from '../../../@types/math/Vec3';

/** f32 count of the uniform struct. */
export const RING_UNIFORM_FLOATS = 24;

export function packRingUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  planetRadiusRatio: number,
  camPosLocal: Readonly<Vec3>,
  innerRatio: number,
): Float32Array {
  const out = new Float32Array(RING_UNIFORM_FLOATS);
  out.set(mvp, 0); // bytes 0..63
  out[16] = sunDirLocal[0]; // byte 64
  out[17] = sunDirLocal[1];
  out[18] = sunDirLocal[2];
  out[19] = planetRadiusRatio; // byte 76 — fills sunDirLocal's vec3 tail
  out[20] = camPosLocal[0]; // byte 80 — vec3, 16-byte aligned
  out[21] = camPosLocal[1];
  out[22] = camPosLocal[2];
  out[23] = innerRatio; // byte 92 — fills camPosLocal's vec3 tail
  return out;
}
