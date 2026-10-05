/**
 * The structure Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { structuresSlice } from './structures/slice';

export const structureLayerSettings = [structuresSlice] as const;
