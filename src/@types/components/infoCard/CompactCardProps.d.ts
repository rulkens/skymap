import type { FocusableTargetBase } from '../../engine/selection/FocusableTargetBase';

/** Props InfoCard passes to a compact (hover-preview) variant; `Target` as in `DetailCardProps`. */
export type CompactCardProps<Target extends FocusableTargetBase = FocusableTargetBase> = {
  target: Target;
};
