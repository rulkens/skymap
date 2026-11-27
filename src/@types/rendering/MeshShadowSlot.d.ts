/**
 * MeshShadowSlot — what the mesh fragment needs to read a body's own shadow layer:
 * `meshShadowLightFromLocal(lightFromMesh, rotM)` with the draw's own `rotM` gives its
 * `lightFromLocal`. `lightFromMesh` is the matrix the layer was rendered with, f64.
 */

export type MeshShadowSlot = {
  readonly slot: number;
  readonly lightFromMesh: Float64Array;
  /** One texel of this layer, in metres: the unit of the receiver's normal offset. */
  readonly texelM: number;
};
