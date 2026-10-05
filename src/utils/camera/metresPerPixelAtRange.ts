/**
 * metresPerPixelAtRange — vertical ground footprint of one pixel at `rangeM`
 * along a `fovYRad` perspective ray, over a `viewportPxHeight`-tall viewport.
 * Sizes a terrain pick's bisection tolerance (spec §8.1/§12): refining a hit
 * past what one pixel covers on screen is work nothing on screen can show.
 */
export function metresPerPixelAtRange(
  rangeM: number,
  fovYRad: number,
  viewportPxHeight: number,
): number {
  return (2 * rangeM * Math.tan(fovYRad / 2)) / viewportPxHeight;
}
