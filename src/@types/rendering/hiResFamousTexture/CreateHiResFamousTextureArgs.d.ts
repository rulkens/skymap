export type CreateHiResFamousTextureArgs = {
  device: GPUDevice;
  /** Per-tier edge length of a layer in pixels — 512 (small) or 1024
   *  (medium / large). Sourced from `HI_RES_LAYER_SIDE_BY_TIER` in
   *  `src/data/sources.ts`. */
  layerSide: number;
  /** Number of layers in the array. Pass `HI_RES_LAYER_COUNT` from
   *  `src/data/sources.ts`. */
  layerCount: number;
};
