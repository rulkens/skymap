/** The Layer's settings tuple, read by `layer.ts` and `appSettingsSlices`. */

import { missionsSlice } from './missions/slice';
import { missionTrailsSlice } from './missionTrails/slice';

export const missionsLayerSettings = [missionsSlice, missionTrailsSlice] as const;
