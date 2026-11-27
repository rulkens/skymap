/**
 * MeshShadowSlot — what the mesh fragment needs to read a body's own shadow layer:
 * `meshShadowLightFromLocal(lightFromMesh, rotM)` with the draw's own `rotM` gives its
 * `lightFromLocal`. `lightFromMesh` is the matrix the layer was rendered with, f64.
 */

export type MeshShadowSlot = {
  readonly slot: number;
  readonly lightFromMesh: Float64Array;
  /** `MESH_SHADOW_NORMAL_OFFSET_TEXELS` of this layer's texels, in metres. */
  readonly normalOffsetM: number;
};
