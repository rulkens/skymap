/**
 * fft — in-place iterative radix-2 Cooley–Tukey transform of a complex signal held as two
 * real arrays. Forward sign convention (e^{−2πikn/N}), unnormalised. Length must be a power
 * of two; the caller zero-pads.
 */

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0)
    throw new Error(`fft: length ${n} not a power of two`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    for (let k = 0; k < half; k++) {
      // Twiddle from a direct cos/sin per k, not a running product: no drift at 2^19 points.
      const wr = Math.cos(ang * k);
      const wi = Math.sin(ang * k);
      for (let i = k; i < n; i += len) {
        const b = i + half;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[i]! - xr;
        im[b] = im[i]! - xi;
        re[i] = re[i]! + xr;
        im[i] = im[i]! + xi;
      }
    }
  }
}
