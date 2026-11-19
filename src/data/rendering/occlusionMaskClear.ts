/** Mirrored as `NO_SURFACE_KM` in `shaders/occlusionMask/io.wesl` (`occlusionMask.parity`). */
export const OCCLUSION_MASK_NO_SURFACE_KM = 1.0e30;

/** Coverage 0, no surface: an unwritten texel reads as one written over empty sky. */
export const OCCLUSION_MASK_CLEAR: GPUColor = { r: 0, g: OCCLUSION_MASK_NO_SURFACE_KM, b: 0, a: 0 };
