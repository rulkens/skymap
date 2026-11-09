/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` and
 * `appSettingsSlices`, which folds it in from HERE for the circular-alias
 * reason `galaxyCatalogLayerSettings`'s header spells out.
 */

import { stellarStreamsSlice } from './stellarStreams/slice';

export const stellarStreamsLayerSettings = [stellarStreamsSlice] as const;
