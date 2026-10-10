/** The Layer's settings tuple, read by `layer.ts` and `appSettingsSlices`. */

import { lightTimeSlice } from './lightTime/slice';

export const lightTimeLayerSettings = [lightTimeSlice] as const;
