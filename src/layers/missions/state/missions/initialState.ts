/** Missions default — the craft captioned. */

import { CRAFT_ENTRY } from '../../sources/craft';
import type { MissionsSettings } from '../../@types/MissionsSettings';

export const initialState: MissionsSettings = {
  items: { [CRAFT_ENTRY.id]: { labelEnabled: true } },
};
