/**
 * MeshShadowTuning — the mesh sun shadows' live knobs (`debug.meshShadowTuning`). Lengths are
 * in texels of the shadow array, so they keep their look when `mapPx` changes. Only `mapPx`
 * redraws the layers; the rest are read by the receivers (`lib/meshShadow.wesl`) each frame.
 */

export type MeshShadowTuning = {
  /** Side of every layer; one of `MESH_SHADOW_MAP_SIZES`. */
  mapPx: number;
  /** Subtracted from the receiver's depth before the compare, in texels of depth. */
  depthBiasTexels: number;
  /** The mesh receiver's step off its own surface before the compare. */
  normalOffsetTexels: number;
  /** Compares per side of the PCF grid, 1..4: 1, 4, 9 or 16 compares. */
  filterSide: number;
  /** The grid spans ± this from the receiver's texel. */
  filterRadiusTexels: number;
};
