import type { ComponentType } from 'react';
import type { FocusableTargetBase } from '../../engine/selection/FocusableTargetBase';
import type { DetailCardProps } from './DetailCardProps';
import type { CompactCardProps } from './CompactCardProps';

/** One kind's card pair, the `detailCard` UI slot's content. Typed as components (not
 * functions returning ReactNode) so InfoCard renders them as JSX elements — calling a
 * hook-using card as a plain function would run its hooks inside InfoCard's own render,
 * tripping React's hook-order rule the moment the selected kind changes. */
export type DetailCardEntry<Target extends FocusableTargetBase = FocusableTargetBase> = {
  readonly Detail: ComponentType<DetailCardProps<Target>>;
  readonly Compact: ComponentType<CompactCardProps<Target>>;
};
