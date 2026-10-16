// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const milkyWayVisibility = [
  { key: 'milkyWayDisk', cluster: 'milkyWay', recession: 'strong' },
  { label: 'milkyWay', cluster: 'milkyWay' },
] as const satisfies readonly VisibilityEntry[];
