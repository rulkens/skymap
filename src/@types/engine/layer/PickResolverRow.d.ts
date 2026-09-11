import type { SourceEntry } from '../../data/SourceEntry';
import type { PickResult } from '../../data/PickResult';
import type { SelectionRef } from '../SelectionRef';
import type { ResolvePickDeps } from '../ResolvePickDeps';

/**
 * One `RESOLVE_PICK` entry as a row, so a Layer contributes its arm instead of core
 * spelling every `SourceEntry['type']`. Tuple-shaped to match `Layer.sources`.
 */
export type PickResolverRow = readonly [
  SourceEntry['type'],
  (entry: SourceEntry, pick: PickResult, deps: ResolvePickDeps) => SelectionRef | null,
];
