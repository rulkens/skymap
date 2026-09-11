/**
 * earth — the body Layer's Earth per-body look-dial cluster: the seeded
 * defaults and the three case reducers that write them. `liftClusterReducers`
 * re-bases those reducers onto the settings root, so their action type
 * strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { EARTH_SURFACE_PARAMS } from '../../../data/bodies/earthSurfaceParams';
import type { EarthSettings } from '../../../@types/settings/EarthSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

export const earthSettingsFragment = {
  key: 'earth',
  // Earth's per-body look dials. Each seeds from its authored data constant so
  // that file stays the default's single source of truth (the same
  // relationship the tonemap exposure default has to `DEFAULT_EXPOSURE`):
  // `atmosphereExposure` from the Earth atmosphere-params row, `ambientLight`
  // (Earth's night-side floor) + `oceanRoughness` (the ocean glint's GGX
  // roughness) from the surface params — where each matches the shared WESL
  // const it mirrors so these Earth-scoped overrides are no-ops at the default.
  seed: (): EarthSettings => ({
    // `earth` is a definitional row in the atmosphere table, so the indexed
    // read is non-null here (the `Record<string, …>` index signature widens it).
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
    // Night-side ambient floor on Earth's surface + cloud shell — read live by
    // `earthPass` / `cloudShellPass` each frame. An Earth-scoped override of
    // the shared `AMBIENT` const (which stays every other lit body's floor).
    setAmbientLight: (cluster: EarthSettings, action: PayloadAction<number>) => {
      cluster.ambientLight = action.payload;
    },
    // Open-water GGX roughness on Earth's surface — read live by `earthPass`
    // each frame. An Earth-scoped override of the `OCEAN_ROUGHNESS` const in
    // `lib/pbr.wesl` (which stays the seed / documentation home).
    setOceanRoughness: (cluster: EarthSettings, action: PayloadAction<number>) => {
      cluster.oceanRoughness = action.payload;
    },
  },
} as const satisfies LayerSettingsFragment<'earth', EarthSettings>;
