/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): one registry
 * row per black hole, collected by `compositions/appSources.ts` into `APP_SOURCE_REGISTRY`.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { SGR_A_STAR_ENTRY } from './sgrAStar';

export const BLACK_HOLE_SOURCE_ROWS = [SGR_A_STAR_ENTRY] as const satisfies readonly SourceEntry[];
