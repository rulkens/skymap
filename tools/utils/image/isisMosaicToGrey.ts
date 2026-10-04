/**
 * isisMosaicToGrey — stretch a float I/F-like mosaic to 8 bits between its
 * `LOW_PERCENTILE`/`HIGH_PERCENTILE` (a few hot pixels sit far above the bulk:
 * Titania's max is 4x its p99.5) and fill nodata flat with the mean of the valid
 * pixels, so the unseen hemisphere is neutral, not black. Throws unless the
 * left edge is lon -180, which is what makes the centre column lon 0 with no roll.
 */

import type { GreyRaster } from '../../@types/image/GreyRaster';
import type { IsisCubeRaster } from '../../@types/image/IsisCubeRaster';

const LOW_PERCENTILE = 0.005;
const HIGH_PERCENTILE = 0.995;
const FULL_SCALE = 255;
const LEFT_EDGE_TOLERANCE_DEG = 1;

export function isisMosaicToGrey(cube: IsisCubeRaster): GreyRaster {
  if (Math.abs(cube.leftLonDeg + 180) > LEFT_EDGE_TOLERANCE_DEG) {
    throw new Error(`isisMosaicToGrey: left edge ${cube.leftLonDeg} deg, expected -180`);
  }
  const valid = cube.data.filter((v) => !Number.isNaN(v)).sort();
  if (valid.length === 0) throw new Error('isisMosaicToGrey: no valid pixels');
  const lo = valid[Math.floor(LOW_PERCENTILE * (valid.length - 1))]!;
  const hi = valid[Math.floor(HIGH_PERCENTILE * (valid.length - 1))]!;
  const toByte = (v: number): number =>
    Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * FULL_SCALE);
  let sum = 0;
  for (const v of valid) sum += Math.min(hi, Math.max(lo, v));
  const fill = toByte(sum / valid.length);
  const data = Uint8Array.from(cube.data, (v) => (Number.isNaN(v) ? fill : toByte(v)));
  return { data, width: cube.width, height: cube.height };
}
