/**
 * packEarthSurfaceUniforms — pure packer for the 144-byte `EarthSurfaceUniforms`
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
 * ## cloudShadowStrength + cloudShellRadius — the cloud-shell fields
 *
 * `cloudShadowStrength` scales how darkly the cloud shell shadows the surface;
 * `cloudShellRadius` is the unit-sphere local radius of that shell (the surface
 * shadow fragment intersects this sphere). Both are bound and unused in plan A —
 * carrying them now means plan D (cloud shell) reads the slots without reshaping
 * the struct. `ambientLight` at float index 27 fills what was the struct's
 * original trailing pad: the night-side ambient floor (the user-tunable
 * Earth-scoped override of the shared `AMBIENT` const), which the surface
 * fragment reads in place of that const. `oceanRoughness` at float index 28
 * opens a fresh 16-byte row: the open-water GGX roughness (the user-tunable
 * Earth-scoped override of the `OCEAN_ROUGHNESS` const in `lib/pbr.wesl`), which
 * the surface fragment reads in place of that const.
 *
 * ## zWin / winX0 / winY0 — the page-table window
 *
 * `zWin` (pyramid level) and `winX0`/`winY0` (the window's origin tile at that
 * level) let the fragment turn a surface uv into a page-table cell; they fill
 * `oceanRoughness`'s row rather than growing a fourth. Carried as `f32` (not
 * `u32`) so the packer stays one `Float32Array` with no second typed-array view
 * to drift out of sync. All-zero is the identity — a caller with no plan yet
 * passes zeros and draws exactly the picture Earth draws without the virtual
 * texture.
 *
 * ## debugLodOverlay — a fresh 16-byte row, no free slot left to reuse
 *
 * Unlike `oceanRoughness` / the page-table window (which filled a row an
 * earlier field had already rounded up to 16 bytes), the struct was exactly
 * 128 bytes with nothing spare — `earthLayer.ts` even has a "KNOWN OMISSION"
 * note recording that the last field left none free. `debugLodOverlay` (the
 * `debug.showEarthLodOverlay` DebugPanel toggle, as 0.0/1.0) therefore opens a
 * new row at byte 128; the fragment reads it with `> 0.5`. The row's other
 * three slots are true padding — nothing else needed packing.
 *
 * ## Byte layout (uniform address space) — 144 bytes / 36 f32
 *
 *   f32 0..15  (byte  0..63):  mvp (column-major mat4x4)
 *   f32 16..18 (byte 64..75):  sunDirLocal (vec3, 16-byte aligned)
 *   f32 19     (byte 76..79):  roughnessBase (fills sunDirLocal's vec3 tail)
 *   f32 20..22 (byte 80..91):  camPosLocal (vec3, 16-byte aligned)
 *   f32 23     (byte 92..95):  f0 (fills camPosLocal's vec3 tail)
 *   f32 24     (byte 96..99):  sunIrradiance
 *   f32 25     (byte 100..103): cloudShadowStrength
 *   f32 26     (byte 104..107): cloudShellRadius (unit-sphere shell radius)
 *   f32 27     (byte 108..111): ambientLight (night-side floor; Earth-scoped)
 *   f32 28     (byte 112..115): oceanRoughness (open-water GGX roughness; Earth-scoped)
 *   f32 29     (byte 116..119): zWin (page-table window level; read as u32)
 *   f32 30     (byte 120..123): winX0 (window origin west column at zWin; as u32)
 *   f32 31     (byte 124..127): winY0 (window origin north row at zWin; as u32)
 *   f32 32     (byte 128..131): debugLodOverlay (0.0/1.0; the LOD-tint debug toggle)
 *   f32 33..35 (byte 132..143): padding (zeroed)
 *
 * @param mvp                 16-element column-major MVP (from `composeBodyMvp`).
 * @param sunDirLocal         Sun direction in the body's local frame.
 * @param camPosLocal         Camera position in the body's local frame.
 * @param roughnessBase       Base surface roughness for GGX specular.
 * @param f0                  Fresnel reflectance at normal incidence.
 * @param sunIrradiance       Scalar sun irradiance scaling the direct term.
 * @param cloudShadowStrength Cloud-shadow darkening (plan A: bound, unused).
 * @param cloudShellRadius    Unit-sphere local radius of the cloud shell the
 *                            surface shadow fragment intersects (plan A: unused).
 * @param ambientLight        Night-side ambient floor (fraction of albedo the
 *                            unlit hemisphere shows); Earth-scoped override of
 *                            the shared `AMBIENT` const.
 * @param oceanRoughness      Open-water GGX perceptual roughness (the ocean
 *                            glint breadth); Earth-scoped override of the
 *                            `OCEAN_ROUGHNESS` const in `lib/pbr.wesl`.
 * @param zWin                Page-table window level (`EarthTilePlan.zWin`).
 * @param winX0               Window origin tile at `zWin`: west column.
 * @param winY0               Window origin tile at `zWin`: north row.
 * @param debugLodOverlay     `debug.showEarthLodOverlay` toggle — packed as
 *                            0.0/1.0, the fragment reads it with `> 0.5`.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of `EarthSurfaceUniforms` — 16 mvp + 4 (sun+rough) + 4 (cam+f0) + 4
 *  (irradiance/cloud/ambient) + 4 (oceanRoughness + the page-table window) + 4
 *  (debugLodOverlay + 3 pad — no free slot left in the prior rows). */
export const EARTH_SURFACE_UNIFORM_FLOATS = 36;

export function packEarthSurfaceUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  roughnessBase: number,
  f0: number,
  sunIrradiance: number,
  cloudShadowStrength: number,
  cloudShellRadius: number,
  ambientLight: number,
  oceanRoughness: number,
  zWin: number,
  winX0: number,
  winY0: number,
  debugLodOverlay: boolean,
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
  out[26] = cloudShellRadius; // byte 104 — the shadow shell's local radius
  out[27] = ambientLight; // byte 108 — night-side floor, fills the former pad
  out[28] = oceanRoughness; // byte 112 — open-water GGX roughness, new 16-byte row
  // The page-table window fills the row's remaining three slots — integers held
  // as f32, read shader-side with u32(...). All-zero is the identity.
  out[29] = zWin; // byte 116 — window level
  out[30] = winX0; // byte 120 — window origin west column at zWin
  out[31] = winY0; // byte 124 — window origin north row at zWin
  // A fresh row — the struct had no free slot left (see the header). Indices
  // 33..35 stay the Float32Array's zero fill (true padding).
  out[32] = debugLodOverlay ? 1.0 : 0.0; // byte 128 — the LOD-tint debug toggle
  return out;
}
