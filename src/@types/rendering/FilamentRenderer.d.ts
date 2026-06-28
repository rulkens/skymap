/**
 * Public surface of the filament renderer. Mirrors the methods the
 * pre-factory class exposed: upload / draw / clear / destroy.
 * Consumers see the identical shape; fade-in is now driven by
 * FadeRegistry (state.subsystems.fades) — the renderer reads the
 * per-frame opacity in `draw` and writes it into a per-handle GPU
 * fade buffer.
 */

import type { mat4 } from 'gl-matrix';
import type { FilamentCloud } from '../data/filament/FilamentCloud';
import type { Vec2 } from '../math/Vec2';

export type FilamentRenderer = {
  readonly label: string;
  upload(cloud: FilamentCloud): void;
  clear(): void;
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: Vec2,
    halfWidthPx: number,
    intensityScale: number,
    fadeOpacity: number,
  ): void;
  destroy(): void;
};
