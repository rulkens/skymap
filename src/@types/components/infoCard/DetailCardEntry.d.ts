import type { ComponentType } from 'react';
import type { SelectionKind } from '../../engine/SelectionKind';
import type { DetailCardProps } from './DetailCardProps';
import type { CompactCardProps } from './CompactCardProps';

/** One FocusableTarget arm's card pair, the `detailCard` UI slot's content —
 * shared between core (five arms) and a Layer contributing its own. The arm
 * `K` is proven by the table key, so an entry never re-narrows `target`.
 * Typed as components (not functions returning ReactNode) so InfoCard renders
 * them as JSX elements — calling a hook-using card as a plain function would
 * run its hooks inside InfoCard's own render, tripping React's hook-order
 * rule the moment the selected kind changes. */
export type DetailCardEntry<K extends SelectionKind = SelectionKind> = {
  readonly Detail: ComponentType<DetailCardProps<K>>;
  readonly Compact: ComponentType<CompactCardProps<K>>;
};
