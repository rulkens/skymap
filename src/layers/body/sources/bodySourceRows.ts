/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the Planet, Earth and Small body
 * rows, collected by `compositions/appSources.ts` into `APP_SOURCE_REGISTRY`.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { PLANET_ENTRY } from './planet';
import { EARTH_ENTRY } from './earth';
import { SMALL_BODY_ENTRY } from './smallBody';

export const BODY_SOURCE_ROWS = [
  PLANET_ENTRY,
  EARTH_ENTRY,
  SMALL_BODY_ENTRY,
] as const satisfies readonly SourceEntry[];
