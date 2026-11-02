/**
 * viewCoverSlice — how far each resting panel reaches over the canvas. Each
 * panel owns one row (`useViewCover`); the camera runtime reads the combined
 * insets to draw the orbit pivot at the centre of what stays uncovered.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { CoverId } from '../../@types/layout/CoverId';
import type { ViewCover } from '../../@types/layout/ViewCover';

const initialState: Partial<Record<CoverId, ViewCover>> = {};

const viewCoverSlice = createSlice({
  name: 'viewCover',
  initialState,
  reducers: {
    viewCoverSet: (covers, action: PayloadAction<{ id: CoverId; cover: ViewCover }>) => {
      covers[action.payload.id] = action.payload.cover;
    },
    viewCoverCleared: (covers, action: PayloadAction<CoverId>) => {
      delete covers[action.payload];
    },
  },
});

export const { viewCoverSet, viewCoverCleared } = viewCoverSlice.actions;

export default viewCoverSlice.reducer;
