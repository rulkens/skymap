/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` and
 * `appSettingsSlices`, which folds it in from HERE for the circular-alias
 * reason `galaxyCatalogLayerSettings`'s header spells out.
 */

import { filamentsSlice } from './filaments/slice';

export const filamentsLayerSettings = [filamentsSlice] as const;
