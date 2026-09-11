/** earth — Earth's per-body look dials, each mirroring a shared WESL const. */

import type { PayloadAction } from '@reduxjs/toolkit';

import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { EARTH_SURFACE_PARAMS } from '../../../data/bodies/earthSurfaceParams';
import type { EarthSettings } from '../../../@types/settings/EarthSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

export const earthSettingsFragment = {
  key: 'earth',
  // Each field seeds from its authored data constant (single source of
  // truth), matching the shared WESL const it mirrors — so these Earth-scoped
  // overrides are no-ops at the default.
  seed: (): EarthSettings => ({
    // `earth` is a definitional atmosphere-table row, so this index read is non-null.
    atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure,
    ambientLight: EARTH_SURFACE_PARAMS.ambientLight,
    oceanRoughness: EARTH_SURFACE_PARAMS.oceanRoughness,
  }),
  reducers: {
    // Exposure scale on the atmosphere shell's HDR output — read live by
    // `atmosphereShellPass` each frame. Twin of `setFilamentIntensity`.
    setAtmosphereExposure: (cluster: EarthSettings, action: PayloadAction<number>) => {
      cluster.atmosphereExposure = action.payload;
    },
    // Night-side ambient floor — read live by `earthPass`/`cloudShellPass` each
    // frame. Earth-scoped override of the shared `AMBIENT` const (every other body's floor).
    setAmbientLight: (cluster: EarthSettings, action: PayloadAction<number>) => {
      cluster.ambientLight = action.payload;
    },
    // Open-water GGX roughness — read live by `earthPass` each frame.
    // Earth-scoped override of `OCEAN_ROUGHNESS` in `lib/pbr.wesl` (its seed home).
    setOceanRoughness: (cluster: EarthSettings, action: PayloadAction<number>) => {
      cluster.oceanRoughness = action.payload;
    },
  },
} as const satisfies LayerSettingsFragment<'earth', EarthSettings>;
