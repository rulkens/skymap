/**
 * Each field starts from its authored data constant (single source of
 * truth), matching the shared WESL const it mirrors — so these Earth-scoped
 * overrides are no-ops at the default.
 */

import { ATMOSPHERE_PARAMS } from '../../../../data/bodies/atmosphereParams';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import type { EarthSettings } from '../../../../@types/settings/EarthSettings';

export const initialState: EarthSettings = {
  // `earth` is a definitional atmosphere-table row, so this index read is non-null.
  atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure,
  ambientLight: EARTH_SURFACE_PARAMS.ambientLight,
  oceanRoughness: EARTH_SURFACE_PARAMS.oceanRoughness,
};
