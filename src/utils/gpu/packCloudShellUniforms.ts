/**
 * packCloudShellUniforms — pure packer for the 96-byte `CloudShellUniforms`
 * struct (`shaders/lib/sphere.wesl`).
 *
 * The cloud shell is a body-agnostic translucent sphere lit by the same
 * body-local sun direction as the surface. Its per-draw uniform buffer carries
 * the lit-body prefix (MVP + `sunDirLocal`), one coverage-to-alpha opacity
 * multiplier, and the sun irradiance the fragment scales its direct term by.
 * This is the single source of truth for that byte layout — the cloud renderer
 * packs through here so the CPU write can never drift from the WGSL struct (a
 * drift the GPU would not report; on iOS it would drop the frame silently).
 *
 * ## Reused lit prefix, then a real field in the vec3 tail, then a new row
 *
 * The first 80 bytes are exactly `LitBodyUniforms`, so this reuses
 * `packLitBodyUniforms` for [0..19] rather than re-deriving the layout — the
 * two can never drift. It then OVERWRITES float index 19 (byte 76): the lit
 * packer leaves that slot a zeroed `_pad` (the vec3's trailing 4 bytes), but
 * here it is the REAL field `cloudOpacity`, the same trick `packRingUniforms`
 * uses to put `planetRadiusRatio` in that slot. `cloudOpacity` is sourced from
 * `CLOUD_SHELL_PARAMS.opacity`.
 *
 * `sunIrradiance` opens a fresh 16-byte row (float index 20, byte 80) because
 * the vec3 tail is already spent on `cloudOpacity`. It is the SAME
 * `EARTH_SURFACE_PARAMS.sunIrradiance` the surface scales its direct term by,
 * passed in at the call site — not a second constant. `ambientLight` fills the
 * first of that row's trailing pads (float index 21, byte 84): the SAME
 * `EARTH_SURFACE_PARAMS.ambientLight` night-side floor the surface reads (the
 * user-tunable Earth-scoped override of the shared `AMBIENT` const), so the deck
 * dims in lockstep with the ground. The last two floats (22..23) round the
 * struct to 96 bytes / 16-byte alignment and stay zeroed.
 *
 * ## Byte layout (matches `CloudShellUniforms`) — 96 bytes / 24 f32
 *
 *   f32 0..15  (byte 0..63):  mvp (column-major mat4x4)
 *   f32 16..18 (byte 64..75): sunDirLocal (vec3, 16-byte aligned)
 *   f32 19     (byte 76..79): cloudOpacity (fills sunDirLocal's vec3 tail)
 *   f32 20     (byte 80..83): sunIrradiance (new row; direct-term scale)
 *   f32 21     (byte 84..87): ambientLight (night-side floor; Earth-scoped)
 *   f32 22..23 (byte 88..95): _pad1/2 (zeroed; rounds struct to 96)
 *
 * @param mvp           16-element column-major MVP (from `composeBodySlabMvp`).
 * @param sunDirLocal   Sun direction in the body's local frame.
 * @param cloudOpacity  Coverage-to-alpha opacity multiplier for the shell.
 * @param sunIrradiance Direct-term scale (`EARTH_SURFACE_PARAMS.sunIrradiance`).
 * @param ambientLight  Night-side ambient floor (`EARTH_SURFACE_PARAMS.ambientLight`);
 *                      Earth-scoped override of the shared `AMBIENT` const.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/**
 * f32 count of `CloudShellUniforms` — 16 mvp + 3 sunDirLocal + 1 opacity + 1
 * irradiance + 1 ambient + 2 pad = 24.
 */
export const CLOUD_SHELL_UNIFORM_FLOATS = 24;

export function packCloudShellUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  cloudOpacity: number,
  sunIrradiance: number,
  ambientLight: number,
): Float32Array {
  const out = new Float32Array(CLOUD_SHELL_UNIFORM_FLOATS);
  // Reuse the 80-byte lit prefix (mvp + sunDirLocal); no re-derivation.
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // f32 0..19
  out[19] = cloudOpacity; // byte 76 — overwrite the lit pad with a real field
  out[20] = sunIrradiance; // byte 80 — new row; scales the fragment's direct term
  out[21] = ambientLight; // byte 84 — night-side floor, fills the first tail pad
  return out;
}
