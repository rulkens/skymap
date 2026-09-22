/**
 * The volume Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { cosmicWebDensitySlice } from './cosmicWebDensity/slice';

export const cosmicWebDensityLayerSettings = [cosmicWebDensitySlice] as const;
