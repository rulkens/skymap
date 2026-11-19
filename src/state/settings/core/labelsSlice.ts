/**
 * labels — cross-cutting label-presentation knobs that MULTIPLY on top of
 * each layer's own label gates; see `LabelSettings`.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { LabelSettings } from '../../../@types/settings/LabelSettings';

const initialState: LabelSettings = { focusedOnly: false };

export const labelsSlice = createSlice({
  name: 'settings/labels',
  reducerPath: 'labels',
  initialState,
  reducers: {
    setLabelsFocusedOnly: (labels, action: PayloadAction<boolean>) => {
      labels.focusedOnly = action.payload;
    },
  },
});

export const { setLabelsFocusedOnly } = labelsSlice.actions;
