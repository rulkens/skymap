/**
 * packCloudShellUniforms — pure packer for the 80-byte `CloudShellUniforms`
 * struct (`shaders/lib/sphere.wesl`).
 *
 * The cloud shell is a body-agnostic translucent sphere lit by the same
 * body-local sun direction as the surface. Its per-draw uniform buffer carries
 * the lit-body prefix (MVP + `sunDirLocal`) plus one coverage-to-alpha opacity
 * multiplier. This is the single source of truth for that byte layout — the
 * cloud renderer packs through here so the CPU write can never drift from the
 * WGSL struct (a drift the GPU would not report; on iOS it would drop the frame
 * silently).
 *
 * ## Reused lit prefix, then a real field in the vec3 tail
 *
 * The first 80 bytes are exactly `LitBodyUniforms`, so this reuses
 * `packLitBodyUniforms` for [0..19] rather than re-deriving the layout — the
 * two can never drift. It then OVERWRITES float index 19 (byte 76): the lit
 * packer leaves that slot a zeroed `_pad` (the vec3's trailing 4 bytes), but
 * here it is the REAL field `cloudOpacity`, the same trick `packRingUniforms`
 * uses to put `planetRadiusRatio` in that slot. `cloudOpacity` is sourced from
 * `CLOUD_SHELL_PARAMS.opacity`.
 *
 * ## Byte layout (matches `CloudShellUniforms`) — 80 bytes / 20 f32
 *
 *   f32 0..15  (byte 0..63):  mvp (column-major mat4x4)
 *   f32 16..18 (byte 64..75): sunDirLocal (vec3, 16-byte aligned)
 *   f32 19     (byte 76..79): cloudOpacity (fills sunDirLocal's vec3 tail)
 *
 * @param mvp          16-element column-major MVP (from `composeBodyMvp`).
 * @param sunDirLocal  Sun direction in the body's local frame.
 * @param cloudOpacity Coverage-to-alpha opacity multiplier for the shell.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of `CloudShellUniforms` — 16 mvp + 3 sunDirLocal + 1 opacity. */
export const CLOUD_SHELL_UNIFORM_FLOATS = 20;

export function packCloudShellUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  cloudOpacity: number,
): Float32Array {
  const out = new Float32Array(CLOUD_SHELL_UNIFORM_FLOATS);
  // Reuse the 80-byte lit prefix (mvp + sunDirLocal); no re-derivation.
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // f32 0..19
  out[19] = cloudOpacity; // byte 76 — overwrite the lit pad with a real field
  return out;
}
