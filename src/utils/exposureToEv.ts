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
 * Presentation only — state stores the linear multiplier, because `hdrKnee` and
 * the tone curve's whitepoint are both expressed in post-exposure linear units
 * and would have to convert back the moment they were compared. The inverse is
 * `evToExposure`.
 */

export function exposureToEv(exposure: number): number {
  return Math.log2(exposure);
}
