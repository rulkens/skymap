/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `SOURCE_REGISTRY` folds in for the Milky Way disk overlay.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { MILKY_WAY_ENTRY } from './milky-way';

export const MILKY_WAY_SOURCE_ROWS = [
  [Source.MilkyWay, MILKY_WAY_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
