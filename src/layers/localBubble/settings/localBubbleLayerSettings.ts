/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` and
 * `appSettingsSlices`, which folds it in from HERE for the circular-alias
 * reason `galaxyCatalogLayerSettings`'s header spells out.
 */

import { localBubbleSlice } from './localBubbleSlice';

export const localBubbleLayerSettings = [localBubbleSlice] as const;
