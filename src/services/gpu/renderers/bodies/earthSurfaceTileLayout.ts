/**
 * earthSurfaceTileLayout — the CPU-side byte layout for the two per-frame
 * storage arrays `earthSurfaceTileRenderer` vertex-pulls from:
 * `array<NodeParams>` (one 32-byte record per cut tile) and
 * `array<TileVertex>` (one 48-byte record per drawn CORNER — the mesh is
 * expanded, not indexed; see the renderer's module header). The
 * authoritative layout is `struct NodeParams` / `struct TileVertex` in
 * `shaders/earthSurfaceTile/io.wesl`; this module is the CPU's single
 * matching statement of it, in the shape `starCatalogLayout.ts` set for the
 * star pipeline's `NodeParams` — see `earthSurfaceTileLayout.test.ts` for
 * the parity guard between the two.
 *
 * @module
 */

/**
 * Bytes of one `NodeParams` element: `originRelCamMpc` vec3 (0..11) +
 * `vertexBase` u32 (12..15) + `atlasUvOrigin` vec2 (16..23) +
 * `atlasUvScale` vec2 (24..31) — 16-byte vec3-aligned, mirroring
 * `starCatalogLayout.ts`'s `NODE_PARAMS_BYTES = 32` shape.
 */
export const NODE_PARAMS_BYTES = 32;

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
): void {
  view.setFloat32(base + 0, originRelCamMpcX, true);
  view.setFloat32(base + 4, originRelCamMpcY, true);
  view.setFloat32(base + 8, originRelCamMpcZ, true);
  view.setUint32(base + 12, vertexBase >>> 0, true);
  view.setFloat32(base + 16, atlasUvOriginX, true);
  view.setFloat32(base + 20, atlasUvOriginY, true);
  view.setFloat32(base + 24, atlasUvScaleX, true);
  view.setFloat32(base + 28, atlasUvScaleY, true);
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
