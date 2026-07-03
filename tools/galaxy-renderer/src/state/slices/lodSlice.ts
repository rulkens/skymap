/**
 * lodSlice — camera-dependent visibility/culling thresholds, mirroring
 * `galaxySlice`'s single-action shallow-patch shape: `lodPatched` is the
 * only write path.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { LodSettings } from '../../../@types/engine/LodSettings';
import { DEFAULT_LOD_SETTINGS } from '../../data/defaultLodSettings';

const lodSlice = createSlice({
  name: 'lod',
  initialState: DEFAULT_LOD_SETTINGS,
  reducers: {
    lodPatched: (lod, action: PayloadAction<Partial<LodSettings>>) => {
      Object.assign(lod, action.payload);
    },
  },
});

export const { lodPatched } = lodSlice.actions;
export default lodSlice.reducer;
