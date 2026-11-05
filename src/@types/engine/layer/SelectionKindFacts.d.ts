import type { SelectionRefBase } from '../selection/SelectionRefBase';
import type { SelectionFocus } from './SelectionFocus';

/**
 * One selectable kind's static facts, declared by the Layer that owns the kind and read by core
 * through `selectionKindOf(type)`. Static because sagas, selectors and `detailCardTable` read them
 * before any Layer has run `create`; it imports no runtime.
 */
export type SelectionKindFacts<Ref extends SelectionRefBase = SelectionRefBase> = {
  readonly type: Ref['type'];
  /** Null: not focusable, so its rows carry no placement and core never frames or rings them. */
  readonly focus: SelectionFocus | null;
};
