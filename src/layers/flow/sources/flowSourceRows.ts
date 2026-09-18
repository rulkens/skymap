/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `SOURCE_REGISTRY` folds in for the CF4++ peculiar-velocity field.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { FLOW_ENTRY } from './flow';

export const FLOW_SOURCE_ROWS = [[Source.Flow, FLOW_ENTRY]] as const satisfies readonly (readonly [
  SourceType,
  SourceEntry,
])[];
