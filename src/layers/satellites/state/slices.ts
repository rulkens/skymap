/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` and
 * `appSettingsSlices`, which folds it in from HERE for the circular-alias
 * reason `galaxyCatalogLayerSettings`'s header spells out.
 */

import { satelliteTuningSlice } from './satelliteTuning/slice';
import { satellitesSlice } from './satellites/slice';

export const satellitesLayerSettings = [satellitesSlice, satelliteTuningSlice] as const;
