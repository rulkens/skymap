import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { FieldArrow } from '../../@types/FieldArrow';
import type { LonLatBounds } from '../../../../src/layers/body/surfaceTiles/format/@types/LonLatBounds';
import type { FieldResult } from '../../@types/FieldResult';
import type { RenderState } from '../../@types/RenderState';

const initialState: RenderState = {
  originalUrl: undefined,
  adjustedUrl: undefined,
  originalBox: undefined,
  adjustedBox: undefined,
  arrows: [],
  fitCoarsened: false,
  renderError: undefined,
};

export const renderSlice = createSlice({
  name: 'render',
  initialState,
  reducers: {
    originalRendered: (state, action: PayloadAction<{ url: string; box: LonLatBounds }>) => {
      state.originalUrl = action.payload.url;
      state.originalBox = action.payload.box;
    },
    adjustedRendered: (state, action: PayloadAction<{ url: string; box: LonLatBounds }>) => {
      state.adjustedUrl = action.payload.url;
      state.adjustedBox = action.payload.box;
      state.renderError = undefined;
    },
    fieldFitted: (state, action: PayloadAction<FieldResult>) => {
      // Stored whole, never mutated in place, so the Draft re-type is sound.
      state.arrows = action.payload.arrows as Draft<FieldArrow>[];
      state.fitCoarsened = action.payload.coarsened;
    },
    fieldCleared: (state) => {
      state.arrows = [];
      state.fitCoarsened = false;
    },
    renderFailed: (state, action: PayloadAction<string>) => {
      state.renderError = action.payload;
    },
  },
});

export const { originalRendered, adjustedRendered, fieldFitted, fieldCleared, renderFailed } =
  renderSlice.actions;
