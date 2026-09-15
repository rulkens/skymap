/**
 * earthSurfaceTileLayout — the CPU-side byte layout for every GPU-visible
 * record `earthSurfaceTileRenderer` writes: the per-frame
 * `array<PatchInstance>` storage buffer (one 64-byte record per cut patch)
 * and the per-draw `SurfaceTileUniforms` uniform block. The authoritative
 * layout is each WESL struct in `shaders/earthSurfaceTile/io.wesl`; this
 * module is the CPU's single matching statement of both, in the shape
 * `starCatalogLayout.ts` set for the star pipeline — see
 * `earthSurfaceTileLayout.test.ts` for the parity guard between the two.
 *
 * @module
 */

import type { Mat3 } from '../../../../@types/math/Mat3';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Bytes of one `PatchInstance` element: `originRelEyeM` vec3 (0..11) +
 * `fadeWeight` f32 (12..15, filling the vec3's alignment pad) + `lon0Rad`
 * / `lat0Rad` / `dLonRad` / `dLatRad` f32 (16..31) + `albedoRect` vec4
 * (32..47) + `fallbackRect` vec4 (48..63) + `heightSlotOrigin` vec2u
 * (64..71) + `edgeCoarser` u32 (72..75) + `heightCells` u32 (76..79, what
 * used to be the struct's trailing pad). The two vec4s must stay BEFORE
 * `heightSlotOrigin` — a vec2u declared earlier pads the record past 80.
 * Reordering the five scalars keeps the stride but re-maps offsets 12..31
 * with no compiler signal — the layout test's per-field assertions are the
 * only guard.
 */
export const PATCH_INSTANCE_BYTES = 80;

/**
 * Pack one `PatchInstance` block at byte `base` of `view`, in the field
 * order the WESL `struct PatchInstance` declares. `originRelEyeM` must come
 * from `patchOriginRelEyeM` — the shader rebuilds the patch frame from the
 * f32 words written here, so the origin has to be derived from the same
 * rounded anchor (spec §7.1) or every patch shifts by ~0.13 m of its own.
 */
export function writePatchInstance(
  view: DataView,
  base: number,
  originRelEyeMX: number,
  originRelEyeMY: number,
  originRelEyeMZ: number,
  fadeWeight: number,
  lon0Rad: number,
  lat0Rad: number,
  dLonRad: number,
  dLatRad: number,
  albedoUvOriginX: number,
  albedoUvOriginY: number,
  albedoUvScaleX: number,
  albedoUvScaleY: number,
  fallbackUvOriginX: number,
  fallbackUvOriginY: number,
  fallbackUvScaleX: number,
  fallbackUvScaleY: number,
  /** Post origin of the leaf's SUB-RECT: its height tile's slot origin plus
   *  `SurfaceCutTile.height.originPosts`. */
  heightSlotOriginX: number,
  heightSlotOriginY: number,
  /** Pre-packed one bit per edge — see `io.wesl`'s `edgeCoarser` comment. */
  edgeCoarser: number,
  /** Cells across that sub-rect: `128 >> levelDelta`. */
  heightCells: number,
): void {
  view.setFloat32(base + 0, originRelEyeMX, true);
  view.setFloat32(base + 4, originRelEyeMY, true);
  view.setFloat32(base + 8, originRelEyeMZ, true);
  view.setFloat32(base + 12, fadeWeight, true);
  view.setFloat32(base + 16, lon0Rad, true);
  view.setFloat32(base + 20, lat0Rad, true);
  view.setFloat32(base + 24, dLonRad, true);
  view.setFloat32(base + 28, dLatRad, true);
  view.setFloat32(base + 32, albedoUvOriginX, true);
  view.setFloat32(base + 36, albedoUvOriginY, true);
  view.setFloat32(base + 40, albedoUvScaleX, true);
  view.setFloat32(base + 44, albedoUvScaleY, true);
  view.setFloat32(base + 48, fallbackUvOriginX, true);
  view.setFloat32(base + 52, fallbackUvOriginY, true);
  view.setFloat32(base + 56, fallbackUvScaleX, true);
  view.setFloat32(base + 60, fallbackUvScaleY, true);
  view.setUint32(base + 64, heightSlotOriginX >>> 0, true);
  view.setUint32(base + 68, heightSlotOriginY >>> 0, true);
  view.setUint32(base + 72, edgeCoarser >>> 0, true);
  view.setUint32(base + 76, heightCells >>> 0, true);
}

/**
 * Bytes of the per-draw `SurfaceTileUniforms` block — see `io.wesl`'s doc
 * comment on that struct for the full field-by-field byte table this
 * constant and `writeSurfaceTileUniforms` are the CPU statement of.
 */
export const SURFACE_TILE_UNIFORM_BYTES = 176;

/**
 * Pack the singleton `SurfaceTileUniforms` block, in the field order the
 * WESL struct declares. One record per draw call (there is exactly one
 * Earth), so offsets are absolute literals rather than `base +` — no array
 * stride to parameterize. Every write is a literal, hand-listed call
 * (including `vp`'s 16 floats, not a loop) so `earthSurfaceTileLayout.test.ts`
 * can parse this function the same mechanical way it parses the
 * array-element writer above.
 */
export function writeSurfaceTileUniforms(
  view: DataView,
  vp: Float32Array,
  /** Identity under the body-slab frame — see the renderer's module header
   *  for why rotCol0/1/2 are inert; kept as a parameter (rather than baked
   *  in here) so this function stays a pure statement of the byte layout. */
  orientation: Readonly<Mat3>,
  radiusM: number,
  /** The template's `n` — the vertex stage's `(i, j)` divisor. */
  meshResolution: number,
  camPosRelBodyM: Readonly<Vec3>,
  sunDirLocal: Readonly<Vec3>,
  roughnessBase: number,
  f0: number,
  sunIrradiance: number,
  ambientLight: number,
  oceanRoughness: number,
  cloudShadowStrength: number,
  cloudShellRadius: number,
  debugLodOverlay: boolean,
): void {
  view.setFloat32(0, vp[0]!, true);
  view.setFloat32(4, vp[1]!, true);
  view.setFloat32(8, vp[2]!, true);
  view.setFloat32(12, vp[3]!, true);
  view.setFloat32(16, vp[4]!, true);
  view.setFloat32(20, vp[5]!, true);
  view.setFloat32(24, vp[6]!, true);
  view.setFloat32(28, vp[7]!, true);
  view.setFloat32(32, vp[8]!, true);
  view.setFloat32(36, vp[9]!, true);
  view.setFloat32(40, vp[10]!, true);
  view.setFloat32(44, vp[11]!, true);
  view.setFloat32(48, vp[12]!, true);
  view.setFloat32(52, vp[13]!, true);
  view.setFloat32(56, vp[14]!, true);
  view.setFloat32(60, vp[15]!, true);
  view.setFloat32(64, orientation[0], true);
  view.setFloat32(68, orientation[1], true);
  view.setFloat32(72, orientation[2], true);
  view.setFloat32(76, radiusM, true);
  view.setFloat32(80, orientation[3], true);
  view.setFloat32(84, orientation[4], true);
  view.setFloat32(88, orientation[5], true);
  view.setUint32(92, meshResolution >>> 0, true);
  view.setFloat32(96, orientation[6], true);
  view.setFloat32(100, orientation[7], true);
  view.setFloat32(104, orientation[8], true);
  view.setFloat32(108, roughnessBase, true);
  view.setFloat32(112, camPosRelBodyM[0], true);
  view.setFloat32(116, camPosRelBodyM[1], true);
  view.setFloat32(120, camPosRelBodyM[2], true);
  view.setFloat32(124, f0, true);
  view.setFloat32(128, sunDirLocal[0], true);
  view.setFloat32(132, sunDirLocal[1], true);
  view.setFloat32(136, sunDirLocal[2], true);
  view.setFloat32(140, sunIrradiance, true);
  view.setFloat32(144, ambientLight, true);
  view.setFloat32(148, oceanRoughness, true);
  view.setFloat32(152, cloudShadowStrength, true);
  view.setFloat32(156, cloudShellRadius, true);
  view.setFloat32(160, debugLodOverlay ? 1.0 : 0.0, true);
  // Bytes 164..175 stay the scratch ArrayBuffer's zero fill (true padding).
}
