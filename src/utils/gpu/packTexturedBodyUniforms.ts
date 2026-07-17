/**
 * packTexturedBodyUniforms — pure packer for the 96-byte
 * `TexturedBodyUniforms` struct (`shaders/lib/sphere.wesl`).
 *
 * A textured planet/moon binds the same lit prefix as Earth plus the two ring
 * radii. This packer reuses `packLitBodyUniforms` for the shared 80-byte prefix
 * so the two layouts CANNOT drift — the ring ratios are the only bytes this
 * file writes itself. The alternative (re-packing mvp + sunDirLocal here) would
 * duplicate the prefix layout and reintroduce exactly the drift the
 * single-source-of-truth packer exists to prevent.
 *
 * The ring ratios are data, not a Saturn-only branch: `ringOuterRatio == 0`
 * means "no ring", which the fragment short-circuits. Every non-ringed body
 * packs zeros and pays nothing.
 *
 * ## Byte layout (matches `TexturedBodyUniforms`)
 *
 *   f32 0..19  (byte 0..79):  LitBodyUniforms prefix (mvp + sunDirLocal + pad)
 *   f32 20     (byte 80..83): ringInnerRatio (ring inner / planet radius)
 *   f32 21     (byte 84..87): ringOuterRatio (ring outer / planet radius; 0 = none)
 *   f32 22..23 (byte 88..95): pad ×2 (zeroed)
 *
 * The ambient floor is not packed on either struct — `litShade` reads
 * `lib/bodyLighting.wesl`'s `AMBIENT` const directly (see `packLitBodyUniforms`).
 *
 * @param mvp            16-element column-major MVP (from `composeBodyMvp`).
 * @param sunDirLocal    Sun direction in the body's local frame.
 * @param ringInnerRatio Ring inner radius / planet radius (0 when no ring).
 * @param ringOuterRatio Ring outer radius / planet radius; 0 ⇒ no ring.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of `TexturedBodyUniforms` — the 20-float lit prefix + 2 ratios + 2 pad. */
export const TEXTURED_BODY_UNIFORM_FLOATS = 24;

export function packTexturedBodyUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  ringInnerRatio: number,
  ringOuterRatio: number,
): Float32Array {
  const out = new Float32Array(TEXTURED_BODY_UNIFORM_FLOATS);
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // bytes 0..79
  out[20] = ringInnerRatio; // byte 80
  out[21] = ringOuterRatio; // byte 84
  // out[22..23] (bytes 88..95) stay zero — the tail pad.
  return out;
}
