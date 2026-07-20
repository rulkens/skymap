/**
 * median — the middle value of a set of numbers.
 *
 * Delegates to `percentile(values, 50)` so the type-7 interpolation lives in
 * exactly one place: for an even-length set the median IS the p50 midpoint of
 * the two central samples, so re-deriving it here would only be an opportunity
 * to drift from `percentile`. (Empty-array handling and the single-element
 * NaN-guard come along for free from that one implementation.)
 */
import { percentile } from './percentile';

export function median(values: readonly number[]): number {
  return percentile(values, 50);
}
