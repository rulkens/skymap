/**
 * Public handle returned by `createStructureMarkerRenderer`. One renderer draws halos
 * + rings for ALL structure categories, each category on its own pre-built
 * SourceUniforms bind group, so the pick path gets `(sourceCode << 26) | index` free.
 */

import type { StructureMarkerDescriptor } from './StructureMarkerDescriptor';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

export type StructureMarkerRenderer = {
  readonly label: string;
  /**
   * Replace the marker set (`[]` clears); partitioned by `category`, one draw each.
   * Positions are packed relative to `camPos`, which the renderer remembers:
   * `draw` and `pickRing` take the f64 view-projection and rebase it on that eye.
   * An instance farther than `maxDistanceMpc` (default none) is pulled in along its
   * line of sight with its radius scaled alike: depth changes, apparent size does not.
   */
  setMarkers(
    descriptors: readonly StructureMarkerDescriptor[],
    camPos: Vec3,
    maxDistanceMpc?: number,
  ): void;
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float64Array,
    viewportSize: Vec2,
    pxPerRad: number,
  ): void;
  markerCount(): number;
  /**
   * One ring-pick draw per category into the caller's pass, which must already bind
   * the r32uint pick attachment and a `depth24plus` depth attachment (this pipeline
   * writes + tests depth, so a galaxy in front of a ring claims the pixel). The
   * matrix packs into this renderer's OWN `@group(0)` buffer, never the draw-time
   * uniform, which holds the last visual frame's stale camera; `@group(1)` is a dummy zeroed
   * FadeUniforms, since every declared group must be bound.
   */
  pickRing(
    passEncoder: GPURenderPassEncoder,
    viewProj: Float64Array,
    viewportPx: Vec2,
    pxPerRad: number,
  ): void;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
