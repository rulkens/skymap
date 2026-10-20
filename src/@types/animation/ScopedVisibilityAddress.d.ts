import type { LabelItemOf } from './LabelItemOf';
import type { LabelName } from './LabelName';
import type { ShowItemOf } from './ShowItemOf';
import type { ShowKey } from './ShowKey';

/** One item of a per-item entry: `survey:milliquas`, `label:structure:void`. An entry
 * without items maps to `never`, since a template over `never` is `never`. */
export type ScopedVisibilityAddress =
  | { [K in ShowKey]: `${K}:${ShowItemOf<K>}` }[ShowKey]
  | { [L in LabelName]: `label:${L}:${LabelItemOf<L>}` }[LabelName];
