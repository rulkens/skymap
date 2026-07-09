/**
 * RenderSettings — per-frame compositing and display knobs. Separated from
 * LodSettings to mirror the GPU boundary: camera UBO (view-dependent LOD)
 * vs composite UBO (view-independent render quality).
 */

import type { TonemapMode } from './TonemapMode';

export type RenderSettings = {
  readonly exposure: number; // default 0.92   — galaxy-engine.js:166
  readonly bloom: number; // default 0.85
  readonly saturation: number; // default 1.26
  readonly vignette: number; // default 0.5
  readonly sizeScale: number; // default 1.0 (engine); the UI seeds 0.3 in plan 03
  readonly starIntensity: number; // default 0.11
  readonly tonemap: TonemapMode; // default 0
};
