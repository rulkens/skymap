/**
 * CubeFace — index into a `2d-array` render target's 6 layers when the array
 * is later sampled as a `texture_cube` (see `RenderTargetSpec.fixedSizePx`).
 * Order and orientation follow the WebGPU/D3D `texture_cube` convention, so a
 * later cube-view bind of the captured layers needs no re-mapping.
 */
export type CubeFace = 0 | 1 | 2 | 3 | 4 | 5; // ±X, ±Y, ±Z, in that index order
