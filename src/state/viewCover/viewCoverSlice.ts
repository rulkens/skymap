/**
 * viewCoverSlice — each resting panel's rect over the canvas. Each panel's
 * container owns one row (measured by `useViewCover`); the camera runtime
 * reads the `LENS_COVER_IDS` rows' combined insets to draw the orbit pivot at
 * the centre of what stays uncovered.
 */
import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

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
      // Stored whole, never mutated in place, so the readonly span may pose as a Draft.
      if (cover) covers[id] = cover as Draft<ViewCover>;
      else delete covers[id];
    },
  },
});

export const { viewCoverSet } = viewCoverSlice.actions;

export default viewCoverSlice.reducer;
