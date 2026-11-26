import type { Vec3 } from '../../../src/@types/math/Vec3';

/** One r8 level: crop `box` out of a whole block-mean level (C-order, x slowest), zero raw values
 *  below `zeroBelowRaw`, code round(255 · log1p(v) / log1p(encodeMax)) clamped to 0..255, x fastest. */
export function encodeVolumeLevel(
  values: Float32Array | Float64Array,
  levelDims: Vec3,
  box: { readonly originVox: Vec3; readonly dims: Vec3 },
  encodeMax: number,
  zeroBelowRaw: number,
): Uint8Array {
  const [, ny, nz] = levelDims;
  const [ox, oy, oz] = box.originVox;
  const [w, h, d] = box.dims;
  const scale = 255 / Math.log1p(encodeMax);
  const out = new Uint8Array(w * h * d);
  for (let z = 0; z < d; z++) {
    for (let y = 0; y < h; y++) {
      const rowStart = (oy + y) * nz + oz + z;
      for (let x = 0; x < w; x++) {
        const v = values[(ox + x) * ny * nz + rowStart]!;
        // A Uint8Array store wraps rather than clamps, hence the min; a threshold ≥ 0 also keeps
        // negatives from reaching it.
        out[x + w * (y + h * z)] =
          v < zeroBelowRaw ? 0 : Math.min(255, Math.round(Math.log1p(v) * scale));
      }
    }
  }
  return out;
}
