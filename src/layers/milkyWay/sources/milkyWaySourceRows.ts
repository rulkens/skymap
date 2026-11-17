/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `compositions/appSources.ts` collects into `APP_SOURCE_REGISTRY` for the Milky Way disk overlay.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { MILKY_WAY_ENTRY } from './milky-way';

export const MILKY_WAY_SOURCE_ROWS = [MILKY_WAY_ENTRY] as const satisfies readonly SourceEntry[];
