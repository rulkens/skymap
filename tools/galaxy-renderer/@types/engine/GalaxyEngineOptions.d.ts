/**
 * GalaxyEngineOptions — initialization configuration for the engine,
 * including optional callbacks for lifecycle events (perf, stats generation).
 */

import type { EngineStats } from './EngineStats';
import type { MilkyWayFadeReadout } from './MilkyWayFadeReadout';
import type { OrientationDiagnostics } from './OrientationDiagnostics';
import type { PerfReport } from './PerfReport';

export type GalaxyEngineOptions = {
  readonly autoRotate?: boolean; // default true — galaxy-engine.js:161
  readonly onPerf?: (report: PerfReport) => void; // every 0.5 s from the rAF loop
  readonly onStats?: (stats: EngineStats) => void; // after each setParams — :180
  // Faster than the perf cadence: the fade tracks the camera, so at 0.5 s a
  // wheel-zoom would land long before the numbers explaining it did.
  readonly onFade?: (readout: MilkyWayFadeReadout) => void; // every 0.1 s from the rAF loop
  // Event-driven, not timed: fires once per `rebuildDustMixture` (a sigma/
  // elongation drag) and once per orientation readback landing — see
  // createGalaxyModel.ts's `reportOrientationDiagnostics`.
  readonly onOrientationDiagnostics?: (diagnostics: OrientationDiagnostics) => void;
};
