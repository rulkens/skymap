/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the one row
 * `compositions/appSources.ts` collects into `APP_SOURCE_REGISTRY` for the CF4++ peculiar-velocity field.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { FLOW_ENTRY } from './flow';

export const FLOW_SOURCE_ROWS = [FLOW_ENTRY] as const satisfies readonly SourceEntry[];
