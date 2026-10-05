/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` and
 * `appSettingsSlices`, which folds it in from HERE for the circular-alias
 * reason `galaxyCatalogLayerSettings`'s header spells out.
 */

import { blackHoleLensingTuningSlice } from './lensingTuning/slice';
import { blackHolesSlice } from './blackHoles/slice';

export const blackHolesLayerSettings = [blackHolesSlice, blackHoleLensingTuningSlice] as const;
