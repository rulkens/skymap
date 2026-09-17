/**
 * gradeRgbaInPlace — apply a `ColourGrade` to an RGBA byte raster in place,
 * sRGB 0..1 either side of the byte encoding. Order matches the albedo bench
 * exactly (`docs` pointer lives on `ColourGrade`): exposure -> gain+offset ->
 * contrast about 0.5 -> saturation about Rec.709 luma -> clamp -> gamma.
 */

import type { ColourGrade } from '../../../src/@types/scene/ColourGrade';

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export function gradeRgbaInPlace(rgba: Uint8Array, grade: ColourGrade): void {
  const exposure = 2 ** grade.ev;
  const invGamma = 1 / grade.gamma;
  const [gainR, gainG, gainB] = grade.gain;
  const [offsetR, offsetG, offsetB] = grade.offset;
  for (let i = 0; i < rgba.length; i += 4) {
    // A no-data pixel's RGB is meaningless — leave it rather than grade noise.
    if (rgba[i + 3] === 0) continue;
    let r = (rgba[i]! / 255) * exposure * gainR + offsetR;
    let g = (rgba[i + 1]! / 255) * exposure * gainG + offsetG;
    let b = (rgba[i + 2]! / 255) * exposure * gainB + offsetB;
    r = (r - 0.5) * grade.contrast + 0.5;
    g = (g - 0.5) * grade.contrast + 0.5;
    b = (b - 0.5) * grade.contrast + 0.5;
    const y = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    r = y + (r - y) * grade.saturation;
    g = y + (g - y) * grade.saturation;
    b = y + (b - y) * grade.saturation;
    r = Math.min(1, Math.max(0, r)) ** invGamma;
    g = Math.min(1, Math.max(0, g)) ** invGamma;
    b = Math.min(1, Math.max(0, b)) ** invGamma;
    rgba[i] = Math.round(r * 255);
    rgba[i + 1] = Math.round(g * 255);
    rgba[i + 2] = Math.round(b * 255);
  }
}
