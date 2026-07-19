/**
 * packEarthSurfaceUniforms — pure packer for the 112-byte `EarthSurfaceUniforms`
 * struct (`shaders/lib/sphere.wesl`).
 *
 * The photoreal-Earth surface pass binds one per-draw uniform buffer carrying
 * the lit-body prefix (MVP + body-local sun direction) plus the physically-based
 * shading parameters its fragment needs: a roughness base, the Fresnel F0, the
 * sun irradiance, and a cloud-shadow strength. This is the single source of
 * truth for that byte layout — the Earth surface renderer packs through here so
 * the CPU write can never drift from the WGSL struct (a drift the GPU would not
 * report; on iOS it would drop the frame silently).
 *
 * ## Reused lit prefix, then a real field in the vec3 tail
 *
 * The first 80 bytes are exactly `LitBodyUniforms`, so this reuses
 * `packLitBodyUniforms` for [0..19] rather than re-deriving the layout — the
 * two can never drift. It then OVERWRITES float index 19 (byte 76): the lit
 * packer leaves that slot a zeroed `_pad` (the vec3's trailing 4 bytes), but
 * here it is the REAL field `roughnessBase`, the same trick `packRingUniforms`
 * uses to put `planetRadiusRatio` in that slot.
 *
 * ## camPosLocal — the view vector for the ocean glint
 *
 * GGX specular is view-dependent, and the lit uniforms carry no camera
 * position, so the ocean glint (the acceptance win) is uncomputable without a
 * view vector. `camPosLocal` (the camera in the body's local frame) is the one
 * field beyond the spec §10 literal list; it fills the second vec3's tail with
 * `f0` just as `roughnessBase` fills the first.
 *
 * ## cloudShadowStrength — the plan-D seam
 *
 * `cloudShadowStrength` is bound and unused in plan A; carrying it now means
 * plan D (cloud shell) never has to reshape the struct — it only reads the slot.
 * The `_pad0` at float index 26 is likewise reserved: plan D renames it to
 * `cloudShellRadius` and gives the packer an 8th argument.
 *
 * ## Byte layout (uniform address space) — 112 bytes / 28 f32
 *
 *   f32 0..15  (byte  0..63):  mvp (column-major mat4x4)
 *   f32 16..18 (byte 64..75):  sunDirLocal (vec3, 16-byte aligned)
 *   f32 19     (byte 76..79):  roughnessBase (fills sunDirLocal's vec3 tail)
 *   f32 20..22 (byte 80..91):  camPosLocal (vec3, 16-byte aligned)
 *   f32 23     (byte 92..95):  f0 (fills camPosLocal's vec3 tail)
 *   f32 24     (byte 96..99):  sunIrradiance
 *   f32 25     (byte 100..103): cloudShadowStrength (plan-D placeholder)
 *   f32 26     (byte 104..107): _pad0 (zeroed; plan-D → cloudShellRadius)
 *   f32 27     (byte 108..111): _pad1 (zeroed; rounds struct to 112 / 16-byte)
 *
 * @param mvp                 16-element column-major MVP (from `composeBodyMvp`).
 * @param sunDirLocal         Sun direction in the body's local frame.
 * @param camPosLocal         Camera position in the body's local frame.
 * @param roughnessBase       Base surface roughness for GGX specular.
 * @param f0                  Fresnel reflectance at normal incidence.
 * @param sunIrradiance       Scalar sun irradiance scaling the direct term.
 * @param cloudShadowStrength Cloud-shadow darkening (plan A: bound, unused).
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of `EarthSurfaceUniforms` — 16 mvp + 4 (sun+rough) + 4 (cam+f0) + 4 tail. */
export const EARTH_SURFACE_UNIFORM_FLOATS = 28;

export function packEarthSurfaceUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  roughnessBase: number,
  f0: number,
  sunIrradiance: number,
  cloudShadowStrength: number,
): Float32Array {
  const out = new Float32Array(EARTH_SURFACE_UNIFORM_FLOATS);
  // Reuse the 80-byte lit prefix (mvp + sunDirLocal); no re-derivation.
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // f32 0..19
  out[19] = roughnessBase; // byte 76 — overwrite the lit pad with a real field
  out[20] = camPosLocal[0]; // byte 80 — vec3, 16-byte aligned
  out[21] = camPosLocal[1]; // byte 84
  out[22] = camPosLocal[2]; // byte 88
  out[23] = f0; // byte 92 — fills camPosLocal's vec3 tail
  out[24] = sunIrradiance; // byte 96
  out[25] = cloudShadowStrength; // byte 100
  // out[26..27] (bytes 104..111) stay zero — the tail pad (plan-D seam).
  return out;
}
