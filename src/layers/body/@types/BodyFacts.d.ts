import type { SurfaceTileDebugSnapshot } from './SurfaceTileDebugSnapshot';

/** What the body Layer publishes into `state.engine.body`: the DebugPanel's tile readout. */
export type BodyFacts = {
  readonly surfaceTileDebug: SurfaceTileDebugSnapshot;
};
