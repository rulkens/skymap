/**
 * Public surface of the filament renderer.  Mirrors the methods the
 * pre-factory class exposed: upload / draw / clear / isFading /
 * destroy.  Consumers (engine teardown, the filament asset slot's
 * commit step, the per-frame loop) see the identical shape.
 */

import type { mat4 } from 'gl-matrix';
import type { FilamentCloud } from '../data/FilamentCloud';

export type FilamentRenderer = {
  /**
   * Human-readable identifier (`'filamentRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /** Upload a new filament cloud, replacing any prior buffer. */
  upload(cloud: FilamentCloud): void;
  /** Drop the loaded filaments without destroying the pipeline itself. */
  clear(): void;
  /**
   * Issue the per-frame draw.  No-op until a cloud has been uploaded
   * (segmentCount = 0 → early return).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    halfWidthPx: number,
    intensityScale: number,
  ): void;
  /**
   * Whether the filament fade-in is still ramping.  Mirrors
   * `PointRenderer.isFading()`.  Returns false before any upload (no
   * fade in flight) and after the smoothstep saturates.
   */
  isFading(): boolean;
  /** Release every GPU buffer + the lazy CloudFade controller. */
  destroy(): void;
};
