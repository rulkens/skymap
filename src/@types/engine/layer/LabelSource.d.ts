import type { EngineState } from '../state/EngineState';
import type { LabelName } from '../../animation/LabelName';
import type { LabelDescription } from '../../rendering/LabelDescription';
import type { LabelStyleId } from '../../rendering/LabelStyleId';

/**
 * A list of labels a Layer declares as data; core encodes, projects, fades and declutters it.
 * `items` and `describe` are methods so a list of sources over different `Item`s type-checks
 * (method parameters are bivariant).
 */
export type LabelSource<Item> = {
  /** The slab whose director draws these labels (`NEAR0` or `COSMO`). */
  readonly slab: number;
  /** The label entry whose handed value fades every label of this source. */
  readonly toggle: LabelName;
  readonly style: LabelStyleId;
  /** Cheap value compared each frame; when it differs core calls `items` and `describe` again.
   *  Omit for a list that never changes. */
  readonly changes?: (state: EngineState) => unknown;
  items(state: EngineState): readonly Item[];
  /** Pure. null = no label for this item. */
  describe(item: Item, index: number): LabelDescription | null;
};
