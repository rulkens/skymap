/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `SOURCE_REGISTRY` folds in for the cosmic-web skeleton.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { FILAMENTS_ENTRY } from './filaments';

export const FILAMENTS_SOURCE_ROWS = [
  [Source.Filaments, FILAMENTS_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
