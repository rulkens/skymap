import type { RootState } from '../../../store/types';
import type { TerrainPickMarkerReadout } from '../@types/TerrainPickMarkerReadout';
import { selectEngineFacts } from '../../../state/engine/selectors';
import { NO_TERRAIN_PICK_MARKER_READOUT } from '../present/terrainPickMarkerReadoutOf';

/** The body Layer's terrain-pick readout; both null before `createLayers` seeds the fact. */
export const selectTerrainPickMarkerReadout = (state: RootState): TerrainPickMarkerReadout =>
  selectEngineFacts(state).body?.terrainPickMarker ?? NO_TERRAIN_PICK_MARKER_READOUT;
