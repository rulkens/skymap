/** What the Layer can show and label, as data. Imports data only: `appVisibility.ts` derives
 * core's address types from it, and a Layer-typed import would make that a circular alias. */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const milkyWayVisibility = [
  { key: 'milkyWayDisk', cluster: 'milkyWay', recession: 'strong' },
  { label: 'milkyWay', cluster: 'milkyWay' },
] as const satisfies readonly VisibilityEntry[];
