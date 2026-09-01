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
 *   f32 0..15  (byte 0..63):  mvp (column-major, from `composeBodySlabMvp`)
 *   f32 16..18 (byte 64..75): sunDirLocal (body-local sun direction)
 *   f32 19     (byte 76..79): planetRadiusRatio (planet radius / ring outer)
 *   f32 20..22 (byte 80..91): camPosLocal (camera in body-local, planet radii)
 *   f32 23     (byte 92..95): innerRatio (ring inner / ring outer)
 *
 * The ambient floor is not packed — the ring fragment's `litShade`
 * (`lib/bodyLighting.wesl`) reads the shared `AMBIENT` const directly.
 *
 * @param mvp               16-element column-major MVP (from `composeBodySlabMvp`).
 * @param sunDirLocal       Sun direction in the host body's local frame.
 * @param planetRadiusRatio Planet radius / ring OUTER radius (in (0, 1)).
 * @param camPosLocal       Camera in the body's local frame, in planet radii
 *                          (planet = unit sphere) — the frame the fragment's
 *                          in-front-of-planet view-ray test runs in.
 * @param innerRatio        Ring inner radius / ring OUTER radius (in (0, 1)).
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** f32 count of `RingUniforms` — 16 mvp + 3 sun + planetRadiusRatio + 3 cam +
 *  innerRatio. */
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
