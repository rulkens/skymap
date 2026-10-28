import type { SurfaceTileDebugSnapshot } from './SurfaceTileDebugSnapshot';
import type { TerrainPickMarkerReadout } from './TerrainPickMarkerReadout';

/** What the body Layer publishes into `state.engine.body`: the DebugPanel's two tile readouts. */
export type BodyFacts = {
  readonly surfaceTileDebug: SurfaceTileDebugSnapshot;
  readonly terrainPickMarker: TerrainPickMarkerReadout;
};
