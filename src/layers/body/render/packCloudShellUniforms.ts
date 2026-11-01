/**
 * packCloudShellUniforms: packer for the 96-byte `CloudShellUniforms` struct
 * (`shaders/lib/sphere.wesl` holds the layout table). Reuses `packLitBodyUniforms`
 * for f32 0..19, then overwrites the lit pad at 19 with `cloudOpacity`.
 * `sunIrradiance` and `ambientLight` are the SAME `EARTH_SURFACE_PARAMS` values the
 * surface uses, passed in, so the deck stays in lockstep with the ground.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of the uniform struct. */
export const CLOUD_SHELL_UNIFORM_FLOATS = 24;

export function packCloudShellUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  cloudOpacity: number,
  sunIrradiance: number,
  ambientLight: number,
): Float32Array {
  const out = new Float32Array(CLOUD_SHELL_UNIFORM_FLOATS);
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // f32 0..19
  out[19] = cloudOpacity; // byte 76 — overwrite the lit pad with a real field
  out[20] = sunIrradiance; // byte 80 — new row; scales the fragment's direct term
  out[21] = ambientLight; // byte 84 — night-side floor, fills the first tail pad
  return out;
}
