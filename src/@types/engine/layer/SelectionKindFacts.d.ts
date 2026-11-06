import type { SelectionRefBase } from '../selection/SelectionRefBase';
import type { SelectionFocus } from './SelectionFocus';

/**
 * One selectable kind's static facts, declared by the Layer that owns the kind and read by core
 * through `selectionKindOf(type)`, which `createLayers` installs from the engine's composition.
 * Static, importing no runtime, because `detailCardTable` folds them at module load, before any
 * Layer has run `create`. Method syntax throughout keeps each Layer's narrower `Ref`/`Row`/`Target`
 * assignable to the base-typed `kinds` list.
 */
export type SelectionKindFacts<
  Ref extends SelectionRefBase = SelectionRefBase,
  Row = unknown,
  Target = unknown,
> = {
  readonly type: Ref['type'];
  /** Null: not focusable, so its rows carry no placement and core never frames or rings them. */
  readonly focus: SelectionFocus | null;
  /**
   * Whether a hover onto or off `ref` may change pixels (a caption whitens, a ring brightens),
   * so `watchSelectionWakeSaga` draws a frame. Coarse on purpose: a needless frame is harmless,
   * a pointer sweeping survey objects must not start any.
   */
  mayHaveLabel(ref: Ref): boolean;
  /**
   * The InfoCard's view-model for a stored row, carrying its `ref`. Pure, for memoised selectors.
   * A lazily loaded sidecar is no input here: the kind's card container reads it off its Layer's
   * facts by id, so a sidecar landing after the row still reaches the card.
   */
  toFocusable(row: Row): Target;
  /** The name the target's card headlines; the dome remote shows it too. */
  displayName(target: Target): string;
};
