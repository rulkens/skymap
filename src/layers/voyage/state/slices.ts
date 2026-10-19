/** The Layer's settings tuple, read by `layer.ts` and `appSettingsSlices`. */

import { voyageSlice } from './voyage/slice';

export const voyageLayerSettings = [voyageSlice] as const;
