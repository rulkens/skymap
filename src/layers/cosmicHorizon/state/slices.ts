/** The Layer's settings tuple, read by `layer.ts` and `appSettingsSlices`. */

import { cosmicHorizonSlice } from './cosmicHorizon/slice';

export const cosmicHorizonLayerSettings = [cosmicHorizonSlice] as const;
