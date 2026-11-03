/**
 * viewCoverSlice — how far each resting panel reaches over the canvas. Each
 * panel's container owns one row (measured by `useViewCover`); the camera
 * runtime reads the combined insets to draw the orbit pivot at the centre of
 * what stays uncovered.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { CoverId } from '../../@types/layout/CoverId';
import type { ViewCover } from '../../@types/layout/ViewCover';

const initialState: Partial<Record<CoverId, ViewCover>> = {};

const viewCoverSlice = createSlice({
  name: 'viewCover',
  initialState,
  reducers: {
    /** A null cover deletes the row. */
    viewCoverSet: (covers, action: PayloadAction<{ id: CoverId; cover: ViewCover | null }>) => {
      const { id, cover } = action.payload;
      if (cover) covers[id] = cover;
      else delete covers[id];
    },
  },
});

export const { viewCoverSet } = viewCoverSlice.actions;

export default viewCoverSlice.reducer;
