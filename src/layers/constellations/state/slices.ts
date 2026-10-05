/**
 * The constellations Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { constellationsSlice } from './constellations/slice';

export const constellationsLayerSettings = [constellationsSlice] as const;
