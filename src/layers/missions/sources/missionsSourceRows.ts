/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one craft row, collected by
 * `compositions/appSources.ts` into `APP_SOURCE_REGISTRY`.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { CRAFT_ENTRY } from './craft';

export const MISSIONS_SOURCE_ROWS = [
  [Source.Craft, CRAFT_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
