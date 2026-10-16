/** What the Layer can show and label, as data. Imports data only: `appVisibility.ts` derives
 * core's address types from it, and a Layer-typed import would make that a circular alias. */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SAMPLED_BODY_IDS } from '../../data/missions/sampledBodyIds';

export const missionsVisibility = [
  { key: 'missionTrails', cluster: 'missionTrails' },
  // No `of`: the craft captions are independent of the trails. Its `items` also claim
  // these bodies from core's scene-body captions.
  { label: 'missions', cluster: 'missions', items: SAMPLED_BODY_IDS, recession: 'mild' },
] as const satisfies readonly VisibilityEntry[];
