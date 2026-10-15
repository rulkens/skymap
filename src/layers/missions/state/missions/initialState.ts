/** Missions default — no emphasised craft, the mission clock at 1×. */

import type { MissionsSettings } from '../../../../@types/settings/MissionsSettings';

export const initialState: MissionsSettings = {
  craft: null,
  speed: 1,
};
