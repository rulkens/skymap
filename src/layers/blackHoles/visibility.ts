// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { BLACK_HOLE_SOURCE_ROWS } from './sources/blackHoleSourceRows';

export const blackHolesVisibility = [
  {
    label: 'blackHole',
    cluster: 'blackHoles',
    items: BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => entry.id),
    recession: 'mild',
  },
] as const satisfies readonly VisibilityEntry[];
