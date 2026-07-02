/**
 * GalaxyEngineOptions — initialization configuration for the engine,
 * including optional callbacks for lifecycle events (FPS, stats generation).
 */

import type { EngineStats } from './EngineStats';

export type GalaxyEngineOptions = {
  readonly autoRotate?: boolean; // default true — galaxy-engine.js:161
  readonly onFps?: (fps: number) => void; // rounded, every 0.5 s — :334-338
  readonly onStats?: (stats: EngineStats) => void; // after each setParams — :180
};
