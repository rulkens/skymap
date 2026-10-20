// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const zoneOfAvoidanceVisibility = [
  { key: 'zoneOfAvoidance' },
  { label: 'zoneOfAvoidance', cluster: 'zoneOfAvoidance', of: 'zoneOfAvoidance' },
] as const satisfies readonly VisibilityEntry[];
