import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { SATELLITES_ENTRY } from './satellites';

export const SATELLITES_SOURCE_ROWS = [SATELLITES_ENTRY] as const satisfies readonly SourceEntry[];
