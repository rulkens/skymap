import type { FocusableTarget } from '../../engine/FocusableTarget';

/** Props InfoCard passes to a detail-card variant, identical across arms. */
export type DetailCardProps = {
  target: FocusableTarget;
  pinned: boolean;
  /**
   * Catalogued galaxy count for a pinned structure, or null/undefined when not
   * applicable. Consumed by the structure arm; other arms ignore it.
   */
  selectedMemberCount?: number | null;
  /**
   * When false (mobile, in-sheet) the card drops its panel frame —
   * background/border/positioning/width caps — so the surrounding sheet owns
   * the surface. Defaults to true.
   */
  chrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};
