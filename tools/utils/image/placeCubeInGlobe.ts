/**
 * placeCubeInGlobe — put a regional ISIS cube into a full-globe grid at the
 * cube's own pixel scale, column 0 = longitude 0, row 0 = the north pole, NaN
 * where the cube has no data. `binFloatDemToEquirect` assumes a whole globe, so
 * this is what lets it take Triton's 165 x 67 degree map. A cube that is already
 * a whole globe comes back as the same object, so the Uranian bakes are untouched.
 */

import type { IsisCubeRaster } from '../../@types/image/IsisCubeRaster';

export function placeCubeInGlobe(cube: IsisCubeRaster): IsisCubeRaster {
  // Within a pixel of 360 x 180 degrees is a whole globe: the labelled pixel scale
  // is rounded, so Ariel's 3652 px span 360.08 degrees.
  const dpp = cube.degPerPixel;
  if (cube.width * dpp > 360 - dpp && cube.height * dpp > 180 - dpp) return cube;
  const width = Math.round(360 / dpp);
  const height = Math.round(width / 2);

  const col0 = Math.round(cube.leftLonDeg / cube.degPerPixel);
  const row0 = Math.round((90 - cube.topLatDeg) / cube.degPerPixel);
  const data = new Float32Array(width * height).fill(NaN);
  for (let y = 0; y < cube.height; y++) {
    const row = row0 + y;
    if (row < 0 || row >= height) continue;
    for (let x = 0; x < cube.width; x++) {
      const col = (((col0 + x) % width) + width) % width;
      data[row * width + col] = cube.data[y * cube.width + x]!;
    }
  }
  return { ...cube, data, width, height, leftLonDeg: 0, topLatDeg: 90 };
}
