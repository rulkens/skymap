/**
 * resampleRgbaBilinear — sample an RGBA raster at a regular grid of points,
 * bilinearly, colour weighted by alpha so a transparent no-data neighbour
 * fades the result out instead of darkening it. Points past the raster's
 * edge clamp to the edge pixel.
 */
export function resampleRgbaBilinear(input: {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Source pixel coordinates of output pixel (0, 0)'s centre, where the
   *  source's pixel centres sit on integers, and the step per output pixel. */
  readonly x0: number;
  readonly y0: number;
  readonly xStep: number;
  readonly yStep: number;
}): Uint8Array {
  const { rgba, width, height, widthPx, heightPx } = input;
  const out = new Uint8Array(widthPx * heightPx * 4);
  for (let py = 0; py < heightPx; py++) {
    const sy = Math.min(height - 1, Math.max(0, input.y0 + py * input.yStep));
    const top = Math.max(0, Math.min(height - 2, Math.floor(sy)));
    const bottom = Math.min(height - 1, top + 1);
    const fy = sy - top;
    for (let px = 0; px < widthPx; px++) {
      const sx = Math.min(width - 1, Math.max(0, input.x0 + px * input.xStep));
      const left = Math.max(0, Math.min(width - 2, Math.floor(sx)));
      const right = Math.min(width - 1, left + 1);
      const fx = sx - left;
      const i00 = (top * width + left) * 4;
      const i01 = (top * width + right) * 4;
      const i10 = (bottom * width + left) * 4;
      const i11 = (bottom * width + right) * 4;
      const a00 = (1 - fx) * (1 - fy) * rgba[i00 + 3]!;
      const a01 = fx * (1 - fy) * rgba[i01 + 3]!;
      const a10 = (1 - fx) * fy * rgba[i10 + 3]!;
      const a11 = fx * fy * rgba[i11 + 3]!;
      const alpha = a00 + a01 + a10 + a11;
      const o = (py * widthPx + px) * 4;
      if (alpha > 0) {
        for (let c = 0; c < 3; c++) {
          const sum =
            a00 * rgba[i00 + c]! +
            a01 * rgba[i01 + c]! +
            a10 * rgba[i10 + c]! +
            a11 * rgba[i11 + c]!;
          out[o + c] = Math.round(sum / alpha);
        }
      }
      out[o + 3] = Math.round(alpha);
    }
  }
  return out;
}
