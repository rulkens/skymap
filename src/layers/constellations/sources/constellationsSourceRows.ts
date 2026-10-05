/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `SOURCE_REGISTRY` folds in for the true-3D constellation overlay.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { CONSTELLATIONS_ENTRY } from './constellations';

export const CONSTELLATIONS_SOURCE_ROWS = [
  [Source.Constellations, CONSTELLATIONS_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
