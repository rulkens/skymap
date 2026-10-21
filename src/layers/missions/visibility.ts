// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { CRAFT_ENTRY } from './sources/craft';

export const missionsVisibility = [
  { key: 'missionTrails' },
  // No `of`: the craft captions are independent of the trails. One item, the craft registry
  // row's "Spacecraft" category, switches every craft caption; core captions no craft.
  { label: 'missions', cluster: 'missions', items: [CRAFT_ENTRY.id], recession: 'mild' },
] as const satisfies readonly VisibilityEntry[];
