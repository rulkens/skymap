import type { FocusableTarget } from '../../engine/FocusableTarget';
import type { SelectionKind } from '../../engine/SelectionKind';

/** Props InfoCard passes to a compact (hover-preview) variant. `target` is
 * narrowed to arm `K` by the table key, not by a runtime guard. */
export type CompactCardProps<K extends SelectionKind = SelectionKind> = {
  target: Extract<FocusableTarget, { type: K }>;
};
