// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const lightTimeVisibility = [
  { key: 'lightTime' },
  { label: 'lightTime', cluster: 'lightTime', of: 'lightTime' },
] as const satisfies readonly VisibilityEntry[];
