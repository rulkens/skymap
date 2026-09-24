/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` and
 * `appSettingsSlices`, which folds it in from HERE for the circular-alias
 * reason `galaxyCatalogLayerSettings`'s header spells out.
 */

import { blackHoleLensingTuningSlice } from './lensingTuning/slice';

export const blackHolesLayerSettings = [blackHoleLensingTuningSlice] as const;
