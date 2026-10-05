/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): one registry
 * row per black hole, folded into `SOURCE_REGISTRY`.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { SGR_A_STAR_ENTRY } from './sgrAStar';

export const BLACK_HOLE_SOURCE_ROWS = [
  [Source.SgrAStar, SGR_A_STAR_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
