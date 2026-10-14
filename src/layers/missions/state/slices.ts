/** The Layer's settings tuple, read by `layer.ts` and `appSettingsSlices`. */

import { missionsSlice } from './missions/slice';

export const missionsLayerSettings = [missionsSlice] as const;
