/**
 * packLitBodyUniforms: packer for the 80-byte `LitBodyUniforms` struct
 * (`shaders/lib/sphere.wesl`, which holds the layout table). A drift from the WGSL
 * struct is silent on the GPU (on iOS the draw is dropped). The tail float is
 * zeroed padding: the ambient floor lives in `lib/bodyLighting.wesl`'s `AMBIENT`
 * const. Returns a `Float32Array` because that is what `draw(uniforms)` uploads.
 */

import type { Vec3 } from '../../../@types/math/Vec3';

/** f32 count of `LitBodyUniforms` — 16 mvp + 3 sunDirLocal + 1 pad. */
export const LIT_BODY_UNIFORM_FLOATS = 20;

export function packLitBodyUniforms(mvp: Float32Array, sunDirLocal: Readonly<Vec3>): Float32Array {
  const out = new Float32Array(LIT_BODY_UNIFORM_FLOATS);
  out.set(mvp.subarray(0, 16), 0); // bytes 0..63
  out[16] = sunDirLocal[0]; // byte 64
  out[17] = sunDirLocal[1]; // byte 68
  out[18] = sunDirLocal[2]; // byte 72
  // out[19] (byte 76) stays zero — the vec3's trailing pad; ambient is a const.
  return out;
}
