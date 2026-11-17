/**
 * The Layer's settings tuple, read by `layer.ts` and `appSettingsSlices` from here for the
 * circular-alias reason `galaxyCatalogLayerSettings`'s header spells out.
 */

import { asteroidTuningSlice } from './asteroidTuning/slice';
import { asteroidsSlice } from './asteroids/slice';

export const asteroidsLayerSettings = [asteroidsSlice, asteroidTuningSlice] as const;
