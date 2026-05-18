/**
 * applyLuminanceAsAlpha — proportional sky removal driven by Rec 709
 * luminance with black-point / white-point / gamma controls.
 *
 * Mutates `buf` in place: alpha = remapped per-pixel luminance.  RGB
 * channels are left untouched.
 *
 * Where this fits in the curator pipeline:
 *
 *   source image → crop → StarNet (strip point sources) →
 *   applyLuminanceAsAlpha (derive a soft alpha from residual extended
 *   structure) → write WebP
 *
 * Why proportional alpha rather than a hard sky cut: the result will
 * be composited (alpha-blended or additively) over the renderer's
 * particle field, so the galaxy should ADD photons to the existing
 * scene rather than punch a hole and overdraw.  A hard step would
 * either lose faint halos entirely (high threshold) or leave a grey
 * rectangle of "almost-sky" (low threshold).  A proportional curve
 * gives the halos partial alpha — they contribute to the composite at
 * the brightness they deserve without erasing what's behind.
 *
 * Mathematically:
 *
 *   t      = saturate((luma - blackPoint) / (whitePoint - blackPoint))
 *   alpha  = round(255 * t^gamma) * existingAlpha / 255
 *
 * Multiplying into existing alpha (rather than overwriting) means the
 * function composes safely after any other alpha-touching pass
 * (radial fade, sky-cut, etc.).
 *
 * Why "one helper per file" under `tools/utils/image/`: this helper
 * isn't famous-galaxy-specific — it's a generic luminance-keying
 * primitive that could front any image processor.  Co-locating it
 * with `tools/famous/famousImageProcessor.ts` over-coupled it to one
 * caller; keeping it in `tools/utils/image/` lets the curator
 * (`tools/famous-curator/`) consume it directly without dragging the
 * famous-galaxy module along.
 */

/**
 * Options for `applyLuminanceAsAlpha`.
 *
 * Together these reproduce the equivalent of Photoshop's Curves +
 * Levels operating on a luminance channel.
 */
export type LuminanceAsAlphaOptions = {
  /**
   * Luma (0..255) at or below which the pixel becomes fully
   * transparent.  Lift this to kill the sky noise floor — after
   * StarNet, residual sky luma is typically ~3-8.  Leave at 0 to
   * preserve every photon.
   */
  blackPoint: number;
  /**
   * Luma (0..255) at or above which the pixel becomes fully opaque.
   * Default 255 (no clipping).  Lower it to brighten faint halos at
   * the cost of saturating bright cores to alpha=1.
   */
  whitePoint: number;
  /**
   * Gamma applied to the normalised luma before mapping to alpha.
   * `gamma=1` is linear ("alpha = luma").  `gamma<1` is a power
   * curve that lifts midtones — useful when faint galaxy halos
   * should contribute more to the composite.  `gamma>1` suppresses
   * midtones, making only the bright core visible.
   *
   * ESO/Hubble press-kit + StarNet output tends to want 0.5..0.8.
   */
  gamma: number;
};

/**
 * Mutate `buf` in place: compute Rec 709 luma per pixel, remap through
 * a (blackPoint, whitePoint, gamma) curve, then multiply the result
 * into the existing alpha channel.
 *
 * Rec 709 luma weights (0.2126 / 0.7152 / 0.0722) match what sRGB
 * monitors actually display as perceived brightness.  Using a straight
 * RGB average would over-weight blue (cool tones falsely "popping" as
 * bright) and under-weight green (galaxy disks losing the bright-green
 * H-alpha-tinted star-forming regions).
 */
export function applyLuminanceAsAlpha(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  opts: LuminanceAsAlphaOptions,
): void {
  const bp = opts.blackPoint;
  // Guard against whitePoint <= blackPoint, which would divide by zero
  // or invert the ramp.  Bumping wp to bp+1 collapses the ramp to a
  // single-luma step, which is a sensible degenerate behaviour.
  const wp = Math.max(bp + 1, opts.whitePoint);
  const invRange = 1 / (wp - bp);
  const gamma = opts.gamma;
  // Skip the pow() call entirely when gamma is exactly 1 — saves a
  // few percent on large images where this loop is the bottleneck.
  const linear = gamma === 1;
  const n = width * height;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = buf[i + 0]!;
    const g = buf[i + 1]!;
    const b = buf[i + 2]!;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let t = (luma - bp) * invRange;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const shaped = linear ? t : Math.pow(t, gamma);
    // Multiply into existing alpha (don't overwrite) so chained passes
    // compose: round to nearest 0..255 byte.
    const a = buf[i + 3]!;
    buf[i + 3] = Math.round((shaped * 255 * a) / 255);
  }
}
