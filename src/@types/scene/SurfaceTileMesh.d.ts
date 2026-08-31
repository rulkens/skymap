/**
 * SurfaceTileMesh — the interleaved geometry arrays for ONE virtual-texture
 * surface tile, baked unit-sphere-local and relative to the tile's OWN
 * origin direction, not the sphere centre — see `bakeSurfaceTileMesh`'s
 * header for the convention and why it dissolves the equirect-UV quantum
 * (spec §3.3). `uvs` are intra-tile `[0,1]^2`, NOT the whole-globe equirect
 * uv `cubeSphereMesh` bakes — the atlas rect remaps these per-instance
 * (Task 4).
 */
export type SurfaceTileMesh = {
  /** (resolution+1)^2 * 3 floats: unit-sphere-frame positions, relative to
   *  the tile's origin direction. */
  readonly positions: Float32Array;
  /** (resolution+1)^2 * 2 floats: intra-tile uv in [0,1]^2. */
  readonly uvs: Float32Array;
  /** (resolution+1)^2 * 3 floats: unit east tangent per vertex, same
   *  convention as `cubeSphereMesh`. */
  readonly tangents: Float32Array;
  /** resolution^2 * 6 indices: two CCW-outward triangles per quad cell. */
  readonly indices: Uint32Array;
};
