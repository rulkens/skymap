import type { FocusableTarget } from '../../engine/FocusableTarget';
import type { CardLayout } from './CardLayout';
import type { SelectionKind } from '../../engine/SelectionKind';

/** Props InfoCard passes to a detail-card variant, identical across arms.
 * `target` is narrowed to arm `K` by the table key, not by a runtime guard. */
export type DetailCardProps<K extends SelectionKind = SelectionKind> = {
  target: Extract<FocusableTarget, { type: K }>;
  isPinned: boolean;
  /** `phone` drops the panel frame (the sheet owns the surface). Defaults to `panel`. */
  layout?: CardLayout;
  /** The Focus pill; InfoCard binds it to this card's target. */
  onFocus?: () => void;
  onClose?: () => void;
};
