/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `SOURCE_REGISTRY` folds in for the galactic-plane dust-band guide.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { ZONE_OF_AVOIDANCE_ENTRY } from './zone-of-avoidance';

export const ZONE_OF_AVOIDANCE_SOURCE_ROWS = [
  [Source.ZoneOfAvoidance, ZONE_OF_AVOIDANCE_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
