/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `compositions/appSources.ts` collects into `APP_SOURCE_REGISTRY` for the galactic-plane dust-band guide.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { ZONE_OF_AVOIDANCE_ENTRY } from './zone-of-avoidance';

export const ZONE_OF_AVOIDANCE_SOURCE_ROWS = [
  ZONE_OF_AVOIDANCE_ENTRY,
] as const satisfies readonly SourceEntry[];
