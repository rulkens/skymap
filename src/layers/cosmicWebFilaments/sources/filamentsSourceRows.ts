/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `compositions/appSources.ts` collects into `APP_SOURCE_REGISTRY` for the cosmic-web skeleton.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { FILAMENTS_ENTRY } from './filaments';

export const FILAMENTS_SOURCE_ROWS = [FILAMENTS_ENTRY] as const satisfies readonly SourceEntry[];
