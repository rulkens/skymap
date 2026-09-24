import type { ReactNode } from 'react';
import type { SelectionKind } from '../../engine/SelectionKind';
import type { DetailCardProps } from './DetailCardProps';
import type { CompactCardProps } from './CompactCardProps';

/** One FocusableTarget arm's card pair, the `detailCard` UI slot's content —
 * shared between core (five arms) and a Layer contributing its own. The arm
 * `K` is proven by the table key, so an entry never re-narrows `target`. */
export type DetailCardEntry<K extends SelectionKind = SelectionKind> = {
  readonly Detail: (props: DetailCardProps<K>) => ReactNode;
  readonly Compact: (props: CompactCardProps<K>) => ReactNode;
};
