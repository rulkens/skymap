/**
 * MeshGroundCaster — a site body whose shadow a surface tile reads: its layer and the matrix
 * taking the tile fragment's eye-relative position (host axes, metres) to that layer's clip
 * (`meshShadowLightFromEye`, narrowed).
 */

export type MeshGroundCaster = {
  readonly slot: number;
  readonly lightFromEye: Float32Array;
};
