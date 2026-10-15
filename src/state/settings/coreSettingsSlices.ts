/** The settings clusters core owns. Shrinks as clusters move out to Layers. */

import { bloomSlice } from './core/bloomSlice';
import { cameraSettingsSlice } from './core/cameraSettingsSlice';
import { debugSlice } from './core/debugSlice';
import { hdrSlice } from './core/hdrSlice';
import { labelsSlice } from './core/labelsSlice';
import { orientationSlice } from './core/orientationSlice';
import { pickingSlice } from './core/pickingSlice';
import { tonemapSlice } from './core/tonemapSlice';

export const CORE_SETTINGS_SLICES = [
  orientationSlice,
  cameraSettingsSlice,
  tonemapSlice,
  hdrSlice,
  bloomSlice,
  labelsSlice,
  pickingSlice,
  debugSlice,
] as const;
