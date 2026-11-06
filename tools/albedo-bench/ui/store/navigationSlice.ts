import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { NavigationState } from '../../@types/NavigationState';
import type { ViewMode } from '../../@types/ViewMode';
import type { ViewState } from '../../@types/ViewState';

const initialState: NavigationState = {
  view: { lon: 137.4, lat: -4.6, spanDeg: 2 },
  viewMode: 'wipe',
  showArrows: true,
};

export const navigationSlice = createSlice({
  name: 'navigation',
  initialState,
  reducers: {
    setView: (state, action: PayloadAction<ViewState>) => {
      state.view = action.payload;
    },
    setViewMode: (state, action: PayloadAction<ViewMode>) => {
      state.viewMode = action.payload;
    },
    setShowArrows: (state, action: PayloadAction<boolean>) => {
      state.showArrows = action.payload;
    },
  },
});

export const { setView, setViewMode, setShowArrows } = navigationSlice.actions;
