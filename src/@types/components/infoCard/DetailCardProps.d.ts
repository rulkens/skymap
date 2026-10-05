import type { FocusableTarget } from '../../engine/FocusableTarget';
import type { SelectionKind } from '../../engine/SelectionKind';

/** Props InfoCard passes to a detail-card variant, identical across arms.
 * `target` is narrowed to arm `K` by the table key, not by a runtime guard. */
export type DetailCardProps<K extends SelectionKind = SelectionKind> = {
  target: Extract<FocusableTarget, { type: K }>;
  isPinned: boolean;
  /**
   * When false (mobile, in-sheet) the card drops its panel frame —
   * background/border/positioning/width caps — so the surrounding sheet owns
   * the surface. Defaults to true.
   */
  hasChrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};
