import type { ReactNode } from 'react';
import type { DetailCardProps } from './DetailCardProps';
import type { CompactCardProps } from './CompactCardProps';

/** One FocusableTarget arm's card pair, the `detailCard` UI slot's content —
 * shared between core (five arms) and a Layer contributing its own. */
export type DetailCardEntry = {
  readonly Detail: (props: DetailCardProps) => ReactNode;
  readonly Compact: (props: CompactCardProps) => ReactNode;
};
