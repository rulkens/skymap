/** Mission trails default — OFF; only the Voyager exhibit turns them on. */

import type { MissionTrailsSettings } from '../../../../@types/settings/MissionTrailsSettings';

export const initialState: MissionTrailsSettings = {
  enabled: false,
  emphasis: null,
};
