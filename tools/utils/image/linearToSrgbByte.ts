/** linearToSrgbByte — sRGB OETF of a linear [0,1] value to an encoded byte, clamping out-of-range input. */

export function linearToSrgbByte(linear: number): number {
  const v = linear <= 0 ? 0 : linear >= 1 ? 1 : linear;
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
}
