/**
 * surfaceTileLayout — byte layout of the records `surfaceTileRenderer` writes:
 * the per-patch `PatchInstance` storage records and the per-draw
 * `SurfaceTileUniforms` block. The authoritative layout is each WESL struct in
 * `shaders/bodies/surfaceTile/io.wesl`; `surfaceTileLayout.test.ts` guards parity.
 *
 * @module
 */

import type { Mat3 } from '../../../../../@types/math/Mat3';
import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { PatchInstanceWords } from '../@types/PatchInstanceWords';

/**
 * Bytes of one `PatchInstance` element: `originRelEyeM` vec3 (0..11) +
 * `fadeWeight` f32 (12..15, filling the vec3's alignment pad) + `lon0Rad`
 * / `lat0Rad` / `dLonRad` / `dLatRad` f32 (16..31) + `albedoRect`,
 * `fallbackRect`, `nightRect` vec4 (32..79) + `heightSlotOrigin` vec2u
 * (80..87) + `edgeCoarser` u32 (88..91) + `heightCells` u32 (92..95). The
 * vec4s must stay BEFORE `heightSlotOrigin` — a vec2u declared earlier pads
 * the record past 96. Reordering the five scalars keeps the stride but
 * re-maps offsets 12..31 with no compiler signal — the layout test's
 * per-field assertions are the only guard.
 */
export const PATCH_INSTANCE_BYTES = 96;

/** Pack one `PatchInstance` block at byte `base` of `view`. */
export function writePatchInstance(view: DataView, base: number, words: PatchInstanceWords): void {
  const { originRelEyeM, fadeWeight, anchor, albedoRect, fallbackRect, nightRect } = words;
  const { heightSlotOrigin, edgeCoarser, heightCells } = words;
  view.setFloat32(base + 0, originRelEyeM[0], true);
  view.setFloat32(base + 4, originRelEyeM[1], true);
  view.setFloat32(base + 8, originRelEyeM[2], true);
  view.setFloat32(base + 12, fadeWeight, true);
  view.setFloat32(base + 16, anchor.lon0Rad, true);
  view.setFloat32(base + 20, anchor.lat0Rad, true);
  view.setFloat32(base + 24, anchor.dLonRad, true);
  view.setFloat32(base + 28, anchor.dLatRad, true);
  view.setFloat32(base + 32, albedoRect[0], true);
  view.setFloat32(base + 36, albedoRect[1], true);
  view.setFloat32(base + 40, albedoRect[2], true);
  view.setFloat32(base + 44, albedoRect[3], true);
  view.setFloat32(base + 48, fallbackRect[0], true);
  view.setFloat32(base + 52, fallbackRect[1], true);
  view.setFloat32(base + 56, fallbackRect[2], true);
  view.setFloat32(base + 60, fallbackRect[3], true);
  view.setFloat32(base + 64, nightRect[0], true);
  view.setFloat32(base + 68, nightRect[1], true);
  view.setFloat32(base + 72, nightRect[2], true);
  view.setFloat32(base + 76, nightRect[3], true);
  view.setUint32(base + 80, heightSlotOrigin[0] >>> 0, true);
  view.setUint32(base + 84, heightSlotOrigin[1] >>> 0, true);
  view.setUint32(base + 88, edgeCoarser >>> 0, true);
  view.setUint32(base + 92, heightCells >>> 0, true);
}

/**
 * Bytes of the per-draw `SurfaceTileUniforms` block; `io.wesl` holds the field table.
 */
export const SURFACE_TILE_UNIFORM_BYTES = 176;

/**
 * Pack the singleton `SurfaceTileUniforms` block. Every write is a literal,
 * hand-listed call (`vp`'s 16 floats included, no loop) because
 * `surfaceTileLayout.test.ts` parses this function mechanically.
 */
export function writeSurfaceTileUniforms(
  view: DataView,
  vp: Float32Array,
  /** Identity under the body-slab frame, so rotCol0/1/2 are inert. */
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
  noDisplacement: boolean,
  noSkirts: boolean,
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
  view.setFloat32(164, noDisplacement ? 1.0 : 0.0, true);
  view.setFloat32(168, noSkirts ? 1.0 : 0.0, true);
  // Bytes 172..175 stay the scratch ArrayBuffer's zero fill (true padding).
}
