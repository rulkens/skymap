/**
 * Dimensions of the committed blue-noise jitter mask (`public/lut/blueNoise.bin`), read by its
 * builder and by the density Layer's `create`, which sizes the texture. The shader reads the texture's own dimensions, so WGSL holds no copy.
 */
export const BLUE_NOISE_MASK_SIZE = 64;
export const BLUE_NOISE_MASK_SLICES = 16;
