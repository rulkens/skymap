/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the Planet and Earth rows, folded
 * into `APP_SOURCE_REGISTRY`.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { PLANET_ENTRY } from './planet';
import { EARTH_ENTRY } from './earth';

export const BODY_SOURCE_ROWS = [
  [Source.Planet, PLANET_ENTRY],
  [Source.Earth, EARTH_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
