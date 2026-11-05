import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { SATELLITES_ENTRY } from './satellites';

export const SATELLITES_SOURCE_ROWS = [
  [Source.Satellite, SATELLITES_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
