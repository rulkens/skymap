/**
 * terrainPickMarker — the debug marker's toggle and radius knob, off by default and never
 * persisted. Its own slice so the marker can be deleted without touching the surface tiles.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const terrainPickMarkerSlice = createSlice({
  name: 'settings/terrainPickMarker',
  reducerPath: 'terrainPickMarker',
  initialState,
  reducers: {
    setTerrainPickMarkerEnabled: (marker, action: PayloadAction<boolean>) => {
      marker.enabled = action.payload;
    },
    // World metres, not a slider position: the UI owns the log10 mapping so the
    // store holds the physical quantity the pass and the readout both want.
    setTerrainPickMarkerRadiusM: (marker, action: PayloadAction<number>) => {
      marker.radiusM = action.payload;
    },
  },
});

export const { setTerrainPickMarkerEnabled, setTerrainPickMarkerRadiusM } =
  terrainPickMarkerSlice.actions;
