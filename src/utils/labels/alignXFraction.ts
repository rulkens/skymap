import type { LabelAlignX } from '../../@types/rendering/LabelAlignX';

/** The share of a line's width `alignX` sets left of the anchor: 0 left, 0.5 centre, 1 right. */
export function alignXFraction(alignX: LabelAlignX): number {
  return alignX === 'left' ? 0 : alignX === 'center' ? 0.5 : alignX === 'right' ? 1 : alignX;
}
