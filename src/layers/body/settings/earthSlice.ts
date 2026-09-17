/** earth — Earth's per-body look dials, each mirroring a shared WESL const. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { EARTH_SURFACE_PARAMS } from '../../../data/bodies/earthSurfaceParams';
import type { EarthSettings } from '../../../@types/settings/EarthSettings';

// Each field starts from its authored data constant (single source of
// truth), matching the shared WESL const it mirrors — so these Earth-scoped
// overrides are no-ops at the default.
const initialState: EarthSettings = {
  // `earth` is a definitional atmosphere-table row, so this index read is non-null.
  atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure,
  ambientLight: EARTH_SURFACE_PARAMS.ambientLight,
  oceanRoughness: EARTH_SURFACE_PARAMS.oceanRoughness,
};

export const earthSlice = createSlice({
  name: 'settings/earth',
  reducerPath: 'earth',
  initialState,
  reducers: {
    // Exposure scale on the atmosphere shell's HDR output — read live by
    // `atmosphereShellPass` each frame. Twin of `setFilamentIntensity`.
    setAtmosphereExposure: (earth, action: PayloadAction<number>) => {
      earth.atmosphereExposure = action.payload;
    },
    // Night-side ambient floor — read live by `earthPass`/`cloudShellPass` each
    // frame. Earth-scoped override of the shared `AMBIENT` const (every other body's floor).
    setAmbientLight: (earth, action: PayloadAction<number>) => {
      earth.ambientLight = action.payload;
    },
    // Open-water GGX roughness — read live by `earthPass` each frame.
    // Earth-scoped override of `OCEAN_ROUGHNESS` in `lib/pbr.wesl` (its seed home).
    setOceanRoughness: (earth, action: PayloadAction<number>) => {
      earth.oceanRoughness = action.payload;
    },
  },
});

export const { setAtmosphereExposure, setAmbientLight, setOceanRoughness } = earthSlice.actions;
