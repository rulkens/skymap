/**
 * packTexturedBodyUniforms — pure packer for the 112-byte
 * `TexturedBodyUniforms` struct (`shaders/lib/sphere.wesl`).
 *
 * A textured planet/moon binds the same lit prefix as Earth plus the two ring
 * radii, the Minnaert limb-darkening params, and the camera in the body's local
 * frame. This packer reuses `packLitBodyUniforms` for the shared 80-byte prefix
 * so the two layouts CANNOT drift — the ring ratios, limb params, and camera
 * are the only bytes this file writes itself. The alternative (re-packing mvp +
 * sunDirLocal here) would duplicate the prefix layout and reintroduce exactly
 * the drift the single-source-of-truth packer exists to prevent.
 *
 * The ring ratios are data, not a Saturn-only branch: `ringOuterRatio == 0`
 * means "no ring", which the fragment short-circuits. Every non-ringed body
 * packs zeros and pays nothing. The Minnaert params are the same data-gate:
 * `limbStrength == 0` (packed for every body without a param row) is the
 * identity, so the fields are behaviour-neutral until a row opts in. `camPosLocal`
 * is the body-local camera position the Minnaert emission-angle cosine needs
 * (view-dependent; the lit prefix carries no camera).
 *
 * ## Byte layout (matches `TexturedBodyUniforms`)
 *
 *   f32 0..19   (byte 0..79):    LitBodyUniforms prefix (mvp + sunDirLocal + pad)
 *   f32 20      (byte 80..83):   ringInnerRatio (ring inner / planet radius)
 *   f32 21      (byte 84..87):   ringOuterRatio (ring outer / planet radius; 0 = none)
 *   f32 22      (byte 88..91):   limbStrength (Minnaert blend, 0 = plain Lambert)
 *   f32 23      (byte 92..95):   limbExponent (Minnaert k; 1 = plain Lambert)
 *   f32 24..26  (byte 96..107):  camPosLocal (camera in the body's local frame)
 *   f32 27      (byte 108..111): pad (zeroed; rounds the struct to 112 / 16-byte)
 *
 * The ambient floor is not packed on either struct — `litShade` reads
 * `lib/bodyLighting.wesl`'s `AMBIENT` const directly (see `packLitBodyUniforms`).
 *
 * @param mvp            16-element column-major MVP (from `composeBodySlabMvp`).
 * @param sunDirLocal    Sun direction in the body's local frame.
 * @param ringInnerRatio Ring inner radius / planet radius (0 when no ring).
 * @param ringOuterRatio Ring outer radius / planet radius; 0 ⇒ no ring.
 * @param limbStrength   Minnaert blend weight (0 ⇒ plain Lambert; out[22]).
 * @param limbExponent   Minnaert exponent k (1 ⇒ plain Lambert; out[23]).
 * @param camPosLocal    Camera position in the body's local frame (out[24..26]).
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of `TexturedBodyUniforms` — the 20-float lit prefix + 2 ratios +
 *  2 Minnaert params + camPosLocal vec3 + 1 pad. */
export const TEXTURED_BODY_UNIFORM_FLOATS = 28;

export function packTexturedBodyUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  ringInnerRatio: number,
  ringOuterRatio: number,
  limbStrength: number,
  limbExponent: number,
  camPosLocal: Readonly<Vec3>,
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
  // out[27] (bytes 108..111) stays zero — the tail pad rounding to 112.
  return out;
}
