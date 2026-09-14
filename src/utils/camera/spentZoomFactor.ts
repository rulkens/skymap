/** The zoom a folded notch may SPEND on the body arm. `inputAggregator` multiplies a
 *  frame's wheel events, so the settle prices off this, never off the unbounded fold. */

const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2.0;

export function spentZoomFactor(factor: number): number {
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
}
