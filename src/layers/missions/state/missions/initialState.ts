/** Missions default — trails OFF; only timeline exhibits turn them on. */

import type { MissionsSettings } from '../../../../@types/settings/MissionsSettings';

export const initialState: MissionsSettings = {
  trails: false,
  craft: null,
  speed: 1,
};
