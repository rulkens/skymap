/**
 * Options for `applyLuminanceAsAlpha`.
 *
 * Together these reproduce the equivalent of Photoshop's Curves + Levels
 * operating on a luminance channel.
 */
export type LuminanceAsAlphaOptions = {
  /**
   * Luma (0..255) at or below which the pixel becomes fully transparent.
   * Lift this to kill the sky noise floor — after StarNet, residual sky
   * luma is typically ~3-8.  Leave at 0 to preserve every photon.
   */
  blackPoint: number;
  /**
   * Luma (0..255) at or above which the pixel becomes fully opaque.
   * Default 255 (no clipping).  Lower it to brighten faint halos at the
   * cost of saturating bright cores to alpha=1.
   */
  whitePoint: number;
  /**
   * Gamma applied to the normalised luma before mapping to alpha.
   * `gamma=1` is linear ("alpha = luma").  `gamma<1` is a power curve that
   * lifts midtones — useful when faint galaxy halos should contribute more
   * to the composite.  `gamma>1` suppresses midtones, making only the
   * bright core visible.
   *
   * ESO/Hubble press-kit + StarNet output tends to want 0.5..0.8.
   */
  gamma: number;
};
