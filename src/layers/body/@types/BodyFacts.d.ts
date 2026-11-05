import type { SurfaceTileDebugSnapshot } from '../surfaceTiles/debug/@types/SurfaceTileDebugSnapshot';
import type { TerrainPickMarkerReadout } from '../terrainPick/@types/TerrainPickMarkerReadout';

/** What the body Layer publishes into `state.engine.body`: the DebugPanel's two tile readouts. */
export type BodyFacts = {
  readonly surfaceTileDebug: SurfaceTileDebugSnapshot;
  readonly terrainPickMarker: TerrainPickMarkerReadout;
};
