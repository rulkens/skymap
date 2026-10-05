/**
 * isisMosaicToGrey — turn a float mosaic into an 8-bit sRGB grey on a physical
 * scale. The mosaic values are proportional to reflectance with 0 = black, so a
 * pixel's linear reflectance is `value / mean * albedo`: the mean maps to the
 * moon's published geometric albedo. A few hot pixels sit far above the bulk
 * (Titania's max is 4x its p99.5) but move the plain mean by under 0.2%, so it is
 * not trimmed. Nodata is filled with the albedo byte so the unseen hemisphere is
 * neutral. Throws unless the left edge is lon -180, which is what makes the
 * centre column lon 0 with no roll.
 */

import type { GreyRaster } from '../../@types/image/GreyRaster';
import type { IsisCubeRaster } from '../../@types/image/IsisCubeRaster';
import { linearToSrgbByte } from './linearToSrgbByte';

const LEFT_EDGE_TOLERANCE_DEG = 1;

export function isisMosaicToGrey(cube: IsisCubeRaster, albedo: number): GreyRaster {
  if (Math.abs(cube.leftLonDeg + 180) > LEFT_EDGE_TOLERANCE_DEG) {
    throw new Error(`isisMosaicToGrey: left edge ${cube.leftLonDeg} deg, expected -180`);
  }
  let sum = 0;
  let count = 0;
  for (const v of cube.data) {
    if (Number.isNaN(v)) continue;
    sum += v;
    count++;
  }
  if (count === 0) throw new Error('isisMosaicToGrey: no valid pixels');
  const reflectancePerValue = albedo / (sum / count);
  const fill = linearToSrgbByte(albedo);
  const data = Uint8Array.from(cube.data, (v) =>
    Number.isNaN(v) ? fill : linearToSrgbByte(v * reflectancePerValue),
  );
  return { data, width: cube.width, height: cube.height };
}
