/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `compositions/appSources.ts` collects into `APP_SOURCE_REGISTRY` for the true-3D constellation overlay.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { CONSTELLATIONS_ENTRY } from './constellations';

export const CONSTELLATIONS_SOURCE_ROWS = [
  CONSTELLATIONS_ENTRY,
] as const satisfies readonly SourceEntry[];
