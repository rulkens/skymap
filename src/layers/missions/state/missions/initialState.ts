/** Missions default — no emphasised craft, the mission clock at 1×, the craft captioned. */

import { CRAFT_ENTRY } from '../../sources/craft';
import type { MissionsSettings } from '../../../../@types/settings/MissionsSettings';

export const initialState: MissionsSettings = {
  craft: null,
  speed: 1,
  items: { [CRAFT_ENTRY.id]: { labelEnabled: true } },
};
