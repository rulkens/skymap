/**
 * famousImageProcessor — pure helpers for turning a raw RGBA pixel buffer
 * into a transparent-background WebP suitable for the curated atlas.
 *
 * The DESI Legacy cutout service serves us a JPEG with a featureless dark
 * sky background and the galaxy in the middle.  We want a soft-edged WebP
 * with the sky cut out so the galaxy floats over the renderer's existing
 * particle field instead of sitting inside an opaque rectangle.
 *
 * Two stages, both pure functions over a Uint8ClampedArray of RGBA bytes:
 *
 *   1. `sampleCornerColor(buf, w, h)` — average the four corner pixels to
 *      establish a "what does sky look like in this image?" colour.  The
 *      cutout is sized to 1.3× the galaxy's diameter, so the corners are
 *      reliably outside the disk in all but the most extended objects.
 *
 *   2. `applyTransparency(buf, w, h, sky, opts)` — walk every pixel,
 *      compute its colour distance from `sky`, and set alpha = 0 when
 *      within `skyTolerance`.  Optionally apply a radial alpha fade in
 *      the outer `fadeOuterFraction` of the image so abrupt edges
 *      (galaxies that fill more of the frame than expected) still
 *      blend smoothly into the renderer.
 *
 * The actual fetch + WebP encoding is wired up in `fetchFamousImages.ts`
 * — keeping the processor a pure module makes the algorithm trivially
 * unit-testable and reusable if we ever swap image sources.
 */

/** RGBA tuple expressed as four `[0, 255]` integers + a 0..255 alpha. */
export type RGBA = { r: number; g: number; b: number; a: number };

/**
 * Sample the four corner pixels of an RGBA buffer and return their
 * average colour.  Used to establish the "sky" colour for the
 * transparency pass below.
 */
export function sampleCornerColor(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
): RGBA {
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of corners) {
    const i = (y * width + x) * 4;
    r += buf[i + 0]!;
    g += buf[i + 1]!;
    b += buf[i + 2]!;
  }
  return {
    r: r / corners.length,
    g: g / corners.length,
    b: b / corners.length,
    a: 255,
  };
}

/**
 * Options for `applyTransparency`.
 */
export type TransparencyOptions = {
  /**
   * Maximum Euclidean RGB distance (in 0..255 space) from the sky
   * reference colour for a pixel to be treated as background.  A pixel
   * within `skyTolerance` is set to alpha 0; further pixels keep their
   * original alpha (or get faded by the radial pass below).
   *
   * Tuning: 8-16 works for typical DESI cutouts; raise if sky still
   * shows through faintly, lower if dim galaxy halos get aggressively
   * cut.
   */
  skyTolerance: number;
  /**
   * Fraction of the image radius (0..1) that should fade out radially.
   * 0 disables the radial fade entirely (rely solely on colour-cut);
   * 0.2 fades the outer 20%; 1 fades from the centre out (probably too
   * aggressive — galaxy disks would lose contrast).
   */
  fadeOuterFraction: number;
};

/**
 * Mutate `buf` in place: set alpha=0 for sky-colour pixels and apply
 * a radial fade in the outer ring.
 */
export function applyTransparency(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  sky: RGBA,
  opts: TransparencyOptions,
): void {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.hypot(cx, cy);
  // Inner radius below which the radial fade is identity (alpha unchanged).
  // Outside this we ramp linearly from 1 → 0 at the corners.
  const fadeInnerR = maxR * (1 - opts.fadeOuterFraction);
  const fadeBand = Math.max(1, maxR - fadeInnerR);

  const tolSq = opts.skyTolerance * opts.skyTolerance;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // ── Colour-cut against the sky reference ───────────────────────
      const dr = buf[i + 0]! - sky.r;
      const dg = buf[i + 1]! - sky.g;
      const db = buf[i + 2]! - sky.b;
      const distSq = dr * dr + dg * dg + db * db;
      if (distSq <= tolSq) {
        buf[i + 3] = 0;
        continue;
      }
      // ── Radial fade in the outer ring ─────────────────────────────
      if (opts.fadeOuterFraction > 0) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > fadeInnerR) {
          const t = Math.min(1, (r - fadeInnerR) / fadeBand);
          // Smoothstep cubic — same shape WGSL's smoothstep uses.
          const fade = 1 - t * t * (3 - 2 * t);
          buf[i + 3] = Math.round(buf[i + 3]! * fade);
        }
      }
    }
  }
}
