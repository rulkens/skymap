/**
 * renderSlice — per-frame compositing knobs, mirroring `galaxySlice`'s
 * single-action shallow-patch shape: `renderPatched` is the only write path,
 * so every slider/preset caller computes a `Partial<RenderSettings>` rather
 * than reaching for a per-knob setter.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import { DEFAULT_RENDER_SETTINGS } from '../../data/defaultRenderSettings';

const renderSlice = createSlice({
  name: 'render',
  initialState: DEFAULT_RENDER_SETTINGS,
  reducers: {
    renderPatched: (render, action: PayloadAction<Partial<RenderSettings>>) => {
      Object.assign(render, action.payload);
    },
  },
});

export const { renderPatched } = renderSlice.actions;
export default renderSlice.reducer;
