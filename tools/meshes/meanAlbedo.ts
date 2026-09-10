/**
 * meanAlbedo — average LINEAR-RGB colour of a decoded albedo image, baked into
 * the mesh's generated row so the distant glint (which never binds the texture)
 * shows the body's real colour. The pixels arrive sRGB-ENCODED, as every PNG
 * albedo map is: averaging the bytes straight would report mid-grey as 0.50
 * instead of 0.22, twice as bright as the map it stands in for.
 */

import type { Vec3 } from '../../src/@types/math/Vec3';

/** Undo the sRGB gamma transfer for one [0,1] channel → linear light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function meanAlbedo(pixels: Uint8ClampedArray, width: number, height: number): Vec3 {
  const texels = width * height;
  const channels = pixels.length / texels;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < texels; i++) {
    const o = i * channels;
    r += srgbToLinear(pixels[o]! / 255);
    g += srgbToLinear(pixels[o + 1]! / 255);
    b += srgbToLinear(pixels[o + 2]! / 255);
  }
  return [r / texels, g / texels, b / texels];
}
