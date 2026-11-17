/**
 * surfaceTileDebug — the surface tiles' diagnostic lenses, off by default and never persisted.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { SurfaceTileOverlayKey } from '../../surfaceTiles/debug/@types/SurfaceTileOverlayKey';

export const surfaceTileDebugSlice = createSlice({
  name: 'settings/surfaceTileDebug',
  reducerPath: 'surfaceTileDebug',
  initialState,
  reducers: {
    setSurfaceTileOverlay: (
      debug,
      action: PayloadAction<{ key: SurfaceTileOverlayKey; enabled: boolean }>,
    ) => {
      debug.overlays[action.payload.key] = action.payload.enabled;
    },
  },
});

export const { setSurfaceTileOverlay } = surfaceTileDebugSlice.actions;
