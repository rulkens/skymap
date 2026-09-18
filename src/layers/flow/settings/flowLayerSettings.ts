/** ONE authority, two readers — see `galaxyCatalogLayerSettings`'s header for the circular-alias reason. */

import { flowSlice } from './flowSlice';

export const flowLayerSettings = [flowSlice] as const;
