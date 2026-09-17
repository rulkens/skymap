/**
 * labels — cross-cutting label-presentation knobs that MULTIPLY on top of
 * each layer's own label gates; see `LabelSettings` for which producers read
 * `focusedOnly` and which draw through a separate pass entirely.
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
