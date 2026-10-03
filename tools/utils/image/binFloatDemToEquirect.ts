/**
 * binFloatDemToEquirect — box-bin a float height raster whose column 0 is
 * longitude 0 (the Schenk Enceladus DEM) onto a smaller equirect grid in the
 * texture convention (prime meridian at the CENTRE column), averaging only valid
 * samples. Cells with none are NaN, for `fillEquirectNodata`.
 *
 * `lonOffsetDeg` is raster east longitude minus texture east longitude at the same
 * spot, so output column c reads the raster at lon(c) + offset. It is rounded to
 * whole output columns: the half-turn roll and the registration shift are one
 * column shift.
 */

const NODATA_BELOW = -1e30;

export function binFloatDemToEquirect(
  src: Float32Array,
  srcChannels: number,
  srcWidth: number,
  srcHeight: number,
  width: number,
  height: number,
  lonOffsetDeg: number,
): Float32Array {
  const sum = new Float64Array(width * height);
  const count = new Uint32Array(width * height);
  const shiftCols = Math.round((lonOffsetDeg / 360) * width);
  for (let y = 0; y < srcHeight; y++) {
    const row = Math.min(height - 1, Math.floor((y / srcHeight) * height));
    for (let x = 0; x < srcWidth; x++) {
      const v = src[(y * srcWidth + x) * srcChannels]!;
      if (!(v > NODATA_BELOW)) continue; // also rejects NaN
      const bin = Math.floor((x / srcWidth) * width);
      const col = (((bin + width / 2 - shiftCols) % width) + width) % width;
      sum[row * width + col]! += v;
      count[row * width + col]!++;
    }
  }
  const out = new Float32Array(width * height).fill(NaN);
  for (let i = 0; i < out.length; i++) if (count[i]) out[i] = sum[i]! / count[i]!;
  return out;
}
