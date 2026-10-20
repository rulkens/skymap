/** Missions default — no emphasised craft, the mission clock at 1×, every craft captioned. */

import type { MissionsSettings } from '../../../../@types/settings/MissionsSettings';
import { SAMPLED_BODY_IDS } from '../../../../data/missions/sampledBodyIds';

// Derived from the craft list so the record is complete: a write sets a field, never a row.
export const initialState: MissionsSettings = {
  craft: null,
  speed: 1,
  items: Object.fromEntries(SAMPLED_BODY_IDS.map((id) => [id, { labelEnabled: true }])),
};
