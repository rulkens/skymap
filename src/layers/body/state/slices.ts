/**
 * The body Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { bodiesSlice } from './bodies/slice';
import { earthSlice } from './earth/slice';

export const bodyLayerSettings = [bodiesSlice, earthSlice] as const;
