import { TERRAIN_PICK_MARKER_DEFAULT_RADIUS_M } from '../../terrainPick/data/terrainPickMarkerSliderFields';
import type { TerrainPickMarkerSettings } from '../../@types/TerrainPickMarkerSettings';

export const initialState: TerrainPickMarkerSettings = {
  enabled: false,
  radiusM: TERRAIN_PICK_MARKER_DEFAULT_RADIUS_M,
};
