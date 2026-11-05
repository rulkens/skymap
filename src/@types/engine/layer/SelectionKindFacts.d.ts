import type { SelectionRefBase } from '../selection/SelectionRefBase';

/**
 * One selectable kind's static facts, declared by the Layer that owns the kind and read by core
 * through `selectionKindOf(type)`. Static because sagas, selectors and `detailCardTable` read them
 * before any Layer has run `create`; it imports no runtime.
 */
export type SelectionKindFacts<Ref extends SelectionRefBase = SelectionRefBase> = {
  readonly type: Ref['type'];
};
