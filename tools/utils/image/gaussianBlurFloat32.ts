/**
 * gaussianBlurFloat32 — separable Gaussian over a single-channel Float32
 * plane. Hand-written rather than handed to sharp because the callers blur
 * SIGNED differences and coverage weights, which sharp would round through
 * 8-bit and clamp at zero.
 *
 * Taps falling outside the plane are dropped, not clamped or renormalised:
 * that keeps a normalised convolution (`blur(w * x) / blur(w)`) exact at the
 * edges, since numerator and denominator lose the same taps.
 */
export function gaussianBlurFloat32(
  src: Float32Array,
  width: number,
  height: number,
  sigmaPx: number,
): Float32Array {
  const radius = Math.max(1, Math.ceil(3 * sigmaPx));
  const kernel = new Float32Array(2 * radius + 1);
  let weight = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigmaPx * sigmaPx));
    kernel[i + radius] = v;
    weight += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i]! /= weight;

  const horizontal = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      const lo = Math.max(-radius, -x);
      const hi = Math.min(radius, width - 1 - x);
      for (let i = lo; i <= hi; i++) acc += src[row + x + i]! * kernel[i + radius]!;
      horizontal[row + x] = acc;
    }
  }

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const lo = Math.max(-radius, -y);
    const hi = Math.min(radius, height - 1 - y);
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = lo; i <= hi; i++) acc += horizontal[(y + i) * width + x]! * kernel[i + radius]!;
      out[y * width + x] = acc;
    }
  }
  return out;
}
