/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one craft row, collected by
 * `compositions/appSources.ts` into `APP_SOURCE_REGISTRY`.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { CRAFT_ENTRY } from './craft';

export const MISSIONS_SOURCE_ROWS = [CRAFT_ENTRY] as const satisfies readonly SourceEntry[];
