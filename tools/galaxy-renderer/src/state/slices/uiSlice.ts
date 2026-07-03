/**
 * uiSlice — app chrome state: which control-panel sections are expanded, the
 * last copy/paste-JSON feedback message, and the auto-rotate toggle. See
 * `UiState`'s docblock for why `autoRotate` lives here rather than on the
 * camera: it's a behaviour *intent*, not a pose.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { UiState } from '../../../@types/state/UiState';
import { DEFAULT_UI_STATE } from '../../data/defaultUiState';

const uiSlice = createSlice({
  name: 'ui',
  initialState: DEFAULT_UI_STATE,
  reducers: {
    sectionToggled: (ui, action: PayloadAction<keyof UiState['openSections']>) => {
      ui.openSections[action.payload] = !ui.openSections[action.payload];
    },
    copyFeedbackSet: (ui, action: PayloadAction<string>) => {
      ui.copyFeedback = action.payload;
    },
    autoRotateSet: (ui, action: PayloadAction<boolean>) => {
      ui.autoRotate = action.payload;
    },
  },
});

export const { sectionToggled, copyFeedbackSet, autoRotateSet } = uiSlice.actions;
export default uiSlice.reducer;
