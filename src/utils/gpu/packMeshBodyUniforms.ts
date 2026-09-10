/**
 * packMeshBodyUniforms — pure packer for the 176-byte `MeshBodyUniforms` struct
 * (`shaders/bodies/meshBody/io.wesl`).
 *
 * It does NOT call `packLitBodyUniforms`, but it MATCHES that packer's first 80
 * bytes byte-for-byte: `sunVisibleFraction` occupies the trailing pad slot the
 * lit packer leaves zeroed (the `RingUniforms.planetRadiusRatio` trick), so the
 * shared packer has nowhere to put a fifth argument. Keep the two prefixes in
 * step by hand.
 *
 * FRAME CONTRACT: `camPosLocal` and `dirToHost` are in the HOST body's fixed
 * axes, relative to this body's centre, in metres — the same axes the vertex
 * stage's `localPos = u.model * position` lands in. `model` carries only the
 * body's own tumble rotation (host-local axes) for rotating normal/tangent; the
 * view rotation is folded into `mvp` alone.
 *
 * ## Byte layout (matches `MeshBodyUniforms`)
 *
 *   f32  0..15  (byte   0..63):  mvp (mat4x4<f32>, column-major)
 *   f32 16..18  (byte  64..75):  sunDirLocal (vec3, 16-byte aligned)
 *   f32 19      (byte  76..79):  sunVisibleFraction (fills the vec3's pad slot)
 *   f32 20..31  (byte  80..127): model (mat3x3<f32> — 3 columns × 16 bytes;
 *                                f32 23/27/31 are the columns' dead tails)
 *   f32 32..34  (byte 128..139): camPosLocal (vec3, 16-byte aligned)
 *   f32 35      (byte 140..143): earthshineStrength (fills camPosLocal's pad)
 *   f32 36..38  (byte 144..155): earthshineColor (vec3, 16-byte aligned)
 *   f32 39      (byte 156..159): _pad0
 *   f32 40..42  (byte 160..171): dirToHost (vec3, unit, body centre → host)
 *   f32 43      (byte 172..175): _pad1 (rounds the struct to 176 / 16)
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

/** f32 count of `MeshBodyUniforms` — 176 bytes. */
export const MESH_BODY_UNIFORM_FLOATS = 44;

export function packMeshBodyUniforms(args: {
  readonly mvp: Float32Array;
  readonly sunDirLocal: Readonly<Vec3>;
  readonly sunVisibleFraction: number;
  readonly model: Readonly<Mat3>;
  readonly camPosLocal: Readonly<Vec3>;
  readonly earthshineStrength: number;
  readonly earthshineColor: Readonly<Vec3>;
  readonly dirToHost: Readonly<Vec3>;
}): Float32Array {
  const out = new Float32Array(MESH_BODY_UNIFORM_FLOATS);
  out.set(args.mvp.subarray(0, 16), 0);
  out[16] = args.sunDirLocal[0];
  out[17] = args.sunDirLocal[1];
  out[18] = args.sunDirLocal[2];
  out[19] = args.sunVisibleFraction;
  // Mat3 is column-major and 9-dense; a WGSL mat3x3 pads each column to 16
  // bytes, so out[23]/[27]/[31] are the columns' dead tails and stay zero.
  const m = args.model;
  out[20] = m[0]; // byte 80  — column 0
  out[21] = m[1];
  out[22] = m[2];
  out[24] = m[3]; // byte 96  — column 1
  out[25] = m[4];
  out[26] = m[5];
  out[28] = m[6]; // byte 112 — column 2
  out[29] = m[7];
  out[30] = m[8];
  out[32] = args.camPosLocal[0];
  out[33] = args.camPosLocal[1];
  out[34] = args.camPosLocal[2];
  out[35] = args.earthshineStrength;
  out[36] = args.earthshineColor[0];
  out[37] = args.earthshineColor[1];
  out[38] = args.earthshineColor[2];
  out[40] = args.dirToHost[0];
  out[41] = args.dirToHost[1];
  out[42] = args.dirToHost[2];
  return out;
}
