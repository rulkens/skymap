/** kneeLuminance — soft-compress de-shaded luminance above `threshold`
 *  (design §8 step 3), so a mostly-corrected crater rim doesn't clip to
 *  white outright. Untouched at and below `threshold`, by the `<=` below. */
export function kneeLuminance(y1: number, threshold: number, softness: number): number {
  if (y1 <= threshold) return y1;
  return threshold + (y1 - threshold) / (1 + (softness * (y1 - threshold)) / (1 - threshold));
}
