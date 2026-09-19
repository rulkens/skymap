/**
 * composeContactDecalMatrices — the contact decal's unit cube [-1,1]³ to clip,
 * and back: `composeMeshMvp · B`, B's columns the decal's half-axes (body frame)
 * and the ground normal scaled to `CONTACT_SHADOW_HALF_HEIGHT_M`, translated to
 * the decal centre. f64 throughout; the caller narrows at the uniform write.
 */

import { mat4d } from 'wgpu-matrix';
import type { ContactDecal } from '../../@types/data/mesh/ContactDecal';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { CONTACT_SHADOW_HALF_HEIGHT_M } from '../../data/bodies/contactShadowHalfHeightM';
import { composeMeshMvp } from './composeMeshMvp';

export function composeContactDecalMatrices(
  slabVp: Float64Array,
  posM: Readonly<Vec3>,
  eyeRelBodyM: Readonly<Vec3>,
  rotM: Readonly<Mat3>,
  decal: ContactDecal,
): { boxToClip: Float64Array; clipToBox: Float64Array } {
  const { centre, halfU: u, halfV: v } = decal;
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const up = CONTACT_SHADOW_HALF_HEIGHT_M / Math.hypot(n[0], n[1], n[2]);
  // prettier-ignore
  const box = new Float64Array([
    u[0], u[1], u[2], 0,
    v[0], v[1], v[2], 0,
    n[0] * up, n[1] * up, n[2] * up, 0,
    centre[0], centre[1], centre[2], 1,
  ]);
  const boxToClip = mat4d.multiply(
    composeMeshMvp(slabVp, posM, eyeRelBodyM, rotM),
    box,
  ) as Float64Array;
  return { boxToClip, clipToBox: mat4d.inverse(boxToClip) as Float64Array };
}
