/**
 * exposureToEv — linear exposure multiplier → exposure value (stops).
 *
 * The tone-map consumes exposure as a linear gain (`scaled = hdr * exposure`),
 * which is what the shader needs but a poor thing to put under a slider: equal
 * steps in linear gain are wildly unequal in perceived brightness, so the low
 * end crawls while the high end jumps. EV is the photographic log2 scale where
 * every whole step is a doubling, giving uniform perceptual spacing across the
 * whole range.
 *
 * Presentation only — state keeps the linear multiplier, since that is the space
 * the curve's own parameters (the Reinhard whitepoint, the asinh softness) and
 * `hdrKnee` are all expressed in, and anything comparing against them would have
 * to convert back. The inverse is `evToExposure`.
 */

export function exposureToEv(exposure: number): number {
  return Math.log2(exposure);
}
