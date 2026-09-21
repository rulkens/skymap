/**
 * The milkyWay Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { milkyWaySlice } from './milkyWay/slice';

export const milkyWayLayerSettings = [milkyWaySlice] as const;
