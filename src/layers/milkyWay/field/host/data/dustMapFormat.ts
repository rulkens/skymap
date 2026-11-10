/**
 * Format of the dust map: four channels, one optical depth per depth slice
 * (tau_0..tau_3, see io.wesl's dustSlices doc), `float16` for headroom since a
 * summed column has no natural upper bound. One channel per slice because a
 * single tau-weighted mean depth puts a hard 50% floor on obscuration.
 */
export const DUST_MAP_FORMAT: GPUTextureFormat = 'rgba16float';
