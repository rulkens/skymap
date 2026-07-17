/**
 * packRingUniforms — pure packer for the 96-byte `RingUniforms` struct
 * (`shaders/lib/sphere.wesl`).
 *
 * The ring binds the same MVP + body-local sun-direction prefix as a lit body,
 * then two ring-shape scalars. Unlike `packLitBodyUniforms`, the float after
 * `sunDirLocal` (byte 76) is a REAL field — `planetRadiusRatio`, filling the
 * vec3's trailing 4-byte slot — not a pad, so this packer writes the prefix
 * directly rather than reusing `packLitBodyUniforms` (whose byte 76 is zeroed).
 *
 * ## Byte layout (matches `RingUniforms`)
 *
 *   f32 0..15  (byte 0..63):  mvp (column-major, from `composeBodyMvp`)
 *   f32 16..18 (byte 64..75): sunDirLocal (body-local sun direction)
 *   f32 19     (byte 76..79): planetRadiusRatio (planet radius / ring outer)
 *   f32 20     (byte 80..83): innerRatio (ring inner / ring outer)
 *   f32 21..23 (byte 84..95): pad ×3 (zeroed)
 *
 * The ambient floor is not packed — the ring fragment's `litShade`
 * (`lib/bodyLighting.wesl`) reads the shared `AMBIENT` const directly.
 *
 * @param mvp               16-element column-major MVP (from `composeBodyMvp`).
 * @param sunDirLocal       Sun direction in the host body's local frame.
 * @param planetRadiusRatio Planet radius / ring OUTER radius (in (0, 1)).
 * @param innerRatio        Ring inner radius / ring OUTER radius (in (0, 1)).
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** f32 count of `RingUniforms` — 16 mvp + 3 sun + 2 ratios + 3 pad. */
export const RING_UNIFORM_FLOATS = 24;

export function packRingUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  planetRadiusRatio: number,
  innerRatio: number,
): Float32Array {
  const out = new Float32Array(RING_UNIFORM_FLOATS);
  out.set(mvp, 0); // bytes 0..63
  out[16] = sunDirLocal[0]; // byte 64
  out[17] = sunDirLocal[1];
  out[18] = sunDirLocal[2];
  out[19] = planetRadiusRatio; // byte 76 — the vec3's 4th slot, a real field
  out[20] = innerRatio; // byte 80
  // out[21..23] (bytes 84..95) stay zero — the tail pad.
  return out;
}
