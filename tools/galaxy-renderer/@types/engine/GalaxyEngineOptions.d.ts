/**
 * GalaxyEngineOptions — initialization configuration for the engine,
 * including optional callbacks for lifecycle events (perf, stats generation).
 */

import type { EngineStats } from './EngineStats';
import type { PerfReport } from './PerfReport';

export type GalaxyEngineOptions = {
  readonly autoRotate?: boolean; // default true — galaxy-engine.js:161
  readonly onPerf?: (report: PerfReport) => void; // every 0.5 s from the rAF loop
  readonly onStats?: (stats: EngineStats) => void; // after each setParams — :180
};
