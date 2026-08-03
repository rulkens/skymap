// macOS's navigator.gpu.getPreferredCanvasFormat() returns bgra8unorm, but
// every JS image consumer (canvas ImageData, PNG encoders) wants RGBA — so a
// grab readback needs its R/B channels swapped when the swap-chain is BGRA.
// Alpha is forced to 255 because the compositor already wrote 1.0 and the
// readback's alpha channel carries nothing meaningful downstream.
export function swizzleToRgba(
  src: Uint8Array,
  paddedBytesPerRow: number,
  size: number,
  bgra: boolean,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = y * paddedBytesPerRow + x * 4;
      const di = (y * size + x) * 4;
      if (bgra) {
        out[di] = src[si + 2]!;
        out[di + 1] = src[si + 1]!;
        out[di + 2] = src[si]!;
      } else {
        out[di] = src[si]!;
        out[di + 1] = src[si + 1]!;
        out[di + 2] = src[si + 2]!;
      }
      out[di + 3] = 255;
    }
  }
  return out;
}
