import { SELECTION_KINDS } from '../../data/selection/selectionKinds';

/**
 * The discriminant of `SelectionRef` AND `FocusableTarget` — every kind a
 * selection can name. The unions' arms are checked against it by the
 * compiler (see `FocusableTargetType`'s `Record<…>` dispatch tables).
 */
export type SelectionKind = (typeof SELECTION_KINDS)[number];
