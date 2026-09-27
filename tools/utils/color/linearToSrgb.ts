/** Apply the sRGB gamma transfer for one [0,1] channel → gamma-encoded.
 *  Inverse of `srgbToLinear`; round-trips every one of the 256 byte levels. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
