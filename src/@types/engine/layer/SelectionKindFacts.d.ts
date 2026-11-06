import type { PlacedRow } from '../selection/PlacedRow';
import type { SelectionRefBase } from '../selection/SelectionRefBase';
import type { SelectionFocus } from './SelectionFocus';

/**
 * One selectable kind's static facts, declared by its Layer and read by core through
 * `selectionKindOf(type)`. Static (no runtime) because `detailCardTable` folds them at module load,
 * before any Layer has run `create`. Method syntax keeps narrower `Ref`/`Row`/`Target` assignable.
 */
export type SelectionKindFacts<
  Ref extends SelectionRefBase = SelectionRefBase,
  Row = any,
  Target = unknown,
> = {
  readonly type: Ref['type'];
  /**
   * Null: not focusable. Only a placed `Row` may set one (core reads focusable rows as `PlacedRow`).
   * The base list's `Row` is `any`, not `unknown`, which would break this conditional.
   */
  readonly focus: 0 extends 1 & Row
    ? SelectionFocus | null
    : [Row] extends [PlacedRow]
      ? SelectionFocus | null
      : null;
  /** Whether a hover onto or off `ref` may change pixels; coarse, a needless frame is harmless. */
  mayHaveLabel(ref: Ref): boolean;
  /** The InfoCard's view-model for a stored row, carrying its `ref`. Pure, for memoised selectors. */
  toFocusable(row: Row): Target;
  /** The name the target's card headlines; the dome remote shows it too. */
  displayName(target: Target): string;
};
