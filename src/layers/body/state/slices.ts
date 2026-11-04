/**
 * The body Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { bodiesSlice } from './bodies/slice';
import { earthSlice } from './earth/slice';
import { orbitTrailsSlice } from './orbitTrails/slice';
import { surfaceTileDebugSlice } from './surfaceTileDebug/slice';
import { terrainPickMarkerSlice } from './terrainPickMarker/slice';

export const bodyLayerSettings = [
  bodiesSlice,
  earthSlice,
  orbitTrailsSlice,
  surfaceTileDebugSlice,
  terrainPickMarkerSlice,
] as const;
