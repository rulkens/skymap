/**
 * earthSurfaceTileLayout — the CPU-side byte layout for every GPU-visible
 * record `earthSurfaceTileRenderer` writes: the two per-frame storage
 * arrays it vertex-pulls from (`array<NodeParams>`, one 64-byte record per
 * cut tile; `array<TileVertex>`, one 48-byte record per drawn CORNER — the
 * mesh is expanded, not indexed; see the renderer's module header) and the
 * 160-byte per-draw `SurfaceTileUniforms` uniform block. The authoritative
 * layout is each WESL struct in `shaders/earthSurfaceTile/io.wesl`; this
 * module is the CPU's single matching statement of all three, in the shape
 * `starCatalogLayout.ts` set for the star pipeline — see
 * `earthSurfaceTileLayout.test.ts` for the parity guard between the two.
 *
 * @module
 */

import type { Mat3 } from '../../../../@types/math/Mat3';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Bytes of one `NodeParams` element: `originRelCamMpc` vec3 (0..11) +
 * `vertexBase` u32 (12..15) + `atlasUvOrigin` vec2 (16..23) + `atlasUvScale`
 * vec2 (24..31) + `fallbackUvOrigin` vec2 (32..39) + `fallbackUvScale` vec2
 * (40..47) + `fadeWeight` f32 (48..51), rounded up to the vec3's 16-byte
 * alignment = 64 (bytes 52..63 are true padding).
 */
export const NODE_PARAMS_BYTES = 64;

/**
 * Bytes of one `TileVertex` element: `position` vec3 (0..11) + `uv` vec2
 * (16..23, after the vec3's 4-byte pad) + `tangent` vec3 (32..43, after
 * the vec2's 8-byte pad), rounded up to the vec3's 16-byte alignment = 48.
 */
export const TILE_VERTEX_BYTES = 48;

/**
 * Pack one `NodeParams` block at byte `base` of `view`, in the field order
 * the WESL `struct NodeParams` declares. `vertexBase` addresses this tile's
 * first corner in the SAME frame's `array<TileVertex>` — always
 * `tileSlot * VERTS_PER_TILE` for a contiguous, unculled pack (see the
 * renderer), carried explicitly rather than re-derived in-shader from
 * `vertex_index` alone.
 */
export function writeSurfaceTileNodeParams(
  view: DataView,
  base: number,
  originRelCamMpcX: number,
  originRelCamMpcY: number,
  originRelCamMpcZ: number,
  vertexBase: number,
  atlasUvOriginX: number,
  atlasUvOriginY: number,
  atlasUvScaleX: number,
  atlasUvScaleY: number,
  fallbackUvOriginX: number,
  fallbackUvOriginY: number,
  fallbackUvScaleX: number,
  fallbackUvScaleY: number,
  fadeWeight: number,
): void {
  view.setFloat32(base + 0, originRelCamMpcX, true);
  view.setFloat32(base + 4, originRelCamMpcY, true);
  view.setFloat32(base + 8, originRelCamMpcZ, true);
  view.setUint32(base + 12, vertexBase >>> 0, true);
  view.setFloat32(base + 16, atlasUvOriginX, true);
  view.setFloat32(base + 20, atlasUvOriginY, true);
  view.setFloat32(base + 24, atlasUvScaleX, true);
  view.setFloat32(base + 28, atlasUvScaleY, true);
  view.setFloat32(base + 32, fallbackUvOriginX, true);
  view.setFloat32(base + 36, fallbackUvOriginY, true);
  view.setFloat32(base + 40, fallbackUvScaleX, true);
  view.setFloat32(base + 44, fallbackUvScaleY, true);
  view.setFloat32(base + 48, fadeWeight, true);
}

/**
 * Pack one `TileVertex` block at byte `base` of `view`, in the field order
 * the WESL `struct TileVertex` declares. One corner of a baked
 * `SurfaceTileMesh` (`bakeSurfaceTileMesh.ts`), expanded through its own
 * `indices` at pack time — see the renderer's module header for why the
 * mesh is expanded rather than drawn indexed.
 */
export function writeTileVertex(
  view: DataView,
  base: number,
  positionX: number,
  positionY: number,
  positionZ: number,
  uvX: number,
  uvY: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
): void {
  view.setFloat32(base + 0, positionX, true);
  view.setFloat32(base + 4, positionY, true);
  view.setFloat32(base + 8, positionZ, true);
  view.setFloat32(base + 16, uvX, true);
  view.setFloat32(base + 20, uvY, true);
  view.setFloat32(base + 32, tangentX, true);
  view.setFloat32(base + 36, tangentY, true);
  view.setFloat32(base + 40, tangentZ, true);
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
 * can parse this function the same mechanical way it parses the two
 * array-element writers above.
 */
export function writeSurfaceTileUniforms(
  view: DataView,
  vp: Float32Array,
  orientation: Readonly<Mat3>,
  radiusMpc: number,
  vertsPerTile: number,
  camPosRelBodyMpc: Readonly<Vec3>,
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
  view.setFloat32(76, radiusMpc, true);
  view.setFloat32(80, orientation[3], true);
  view.setFloat32(84, orientation[4], true);
  view.setFloat32(88, orientation[5], true);
  view.setUint32(92, vertsPerTile >>> 0, true);
  view.setFloat32(96, orientation[6], true);
  view.setFloat32(100, orientation[7], true);
  view.setFloat32(104, orientation[8], true);
  view.setFloat32(108, roughnessBase, true);
  view.setFloat32(112, camPosRelBodyMpc[0], true);
  view.setFloat32(116, camPosRelBodyMpc[1], true);
  view.setFloat32(120, camPosRelBodyMpc[2], true);
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
