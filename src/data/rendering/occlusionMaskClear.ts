/**
 * What an occlusion-mask target clears to: coverage 0 and "no surface", so a texel no
 * pass wrote reads the same as one the pass wrote over empty sky. The distance's WGSL
 * twin is `NO_SURFACE_KM` in `shaders/occlusionMask/io.wesl` (`occlusionMask.parity`).
 */
export const OCCLUSION_MASK_NO_SURFACE_KM = 1.0e30;

export const OCCLUSION_MASK_CLEAR: GPUColor = { r: 0, g: OCCLUSION_MASK_NO_SURFACE_KM, b: 0, a: 0 };
