/**
 * packMeshBodyUniforms — pure packer for the 176-byte `MeshBodyUniforms` struct.
 * The layout lives ONCE, beside the struct, in `shaders/bodies/meshBody/io.wesl`'s
 * header — read it there; the writes below are in that order. It MATCHES
 * `packLitBodyUniforms`'s first 80 bytes byte-for-byte (keep the two in step by
 * hand); `camPosLocal`/`dirToHost` are in the HOST body's fixed axes, not this
 * body's own — the same axes `localPos = u.model * position` lands in.
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
