import type { FocusableTargetBase } from '../../engine/selection/FocusableTargetBase';
import type { CardLayout } from './CardLayout';

/** Props InfoCard passes to a detail-card variant, identical across kinds. A Layer's card
 * names its own `Target`; InfoCard's table lookup by `target.type` is the narrowing proof. */
export type DetailCardProps<Target extends FocusableTargetBase = FocusableTargetBase> = {
  target: Target;
  isPinned: boolean;
  /** `phone` drops the panel frame (the sheet owns the surface). Defaults to `panel`. */
  layout?: CardLayout;
  /** The Focus pill; InfoCard binds it to this card's target. */
  onFocus?: () => void;
  onClose?: () => void;
};
