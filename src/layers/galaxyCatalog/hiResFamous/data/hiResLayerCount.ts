/**
 * Layers in the `texture_2d_array` holding Famous-galaxy thumbnails at curator resolution. Cost is
 * `N * layerSide² * 4 bytes`: 32 MB at 1024² (medium/large), 8 MB at 512² (small, downsampled at
 * decode). `docs/adrs/0002-tiered-thumbnail-textures.md` and the fade-band math assume these.
 */
export const HI_RES_LAYER_COUNT = 8 as const;
