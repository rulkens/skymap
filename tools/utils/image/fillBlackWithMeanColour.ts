/**
 * fillBlackWithMeanColour — replace every exactly-black RGB pixel with the mean
 * colour of the non-black ones, in place, and return that mean. Triton's Voyager
 * 2 map is pure black over the northern 39% that sat in polar night; a flat mean
 * tone reads as unseen terrain where black would read as a hole. Run it at
 * source resolution: resampling first would blend black into the boundary and
 * leave a dark fringe that no longer matches "exactly black".
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';

export function fillBlackWithMeanColour(rgb: Uint8Array): Vec3 {
  let r = 0;
  let g = 0;
  let b = 0;
  let seen = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    if (rgb[i] === 0 && rgb[i + 1] === 0 && rgb[i + 2] === 0) continue;
    r += rgb[i]!;
    g += rgb[i + 1]!;
    b += rgb[i + 2]!;
    seen++;
  }
  if (seen === 0) return [0, 0, 0];
  const mean: Vec3 = [Math.round(r / seen), Math.round(g / seen), Math.round(b / seen)];
  for (let i = 0; i < rgb.length; i += 3) {
    if (rgb[i] === 0 && rgb[i + 1] === 0 && rgb[i + 2] === 0) {
      rgb[i] = mean[0];
      rgb[i + 1] = mean[1];
      rgb[i + 2] = mean[2];
    }
  }
  return mean;
}
