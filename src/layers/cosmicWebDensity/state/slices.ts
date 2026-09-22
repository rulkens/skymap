/**
 * The volume Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { volumesSlice } from './cosmicWebDensity/slice';

export const volumeLayerSettings = [volumesSlice] as const;
