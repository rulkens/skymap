/**
 * Public handle returned by `createStructureMarkerRenderer`. One renderer draws halos
 * + rings for ALL structure categories, each category on its own pre-built
 * SourceUniforms bind group, so the pick path gets `(sourceCode << 26) | index` free.
 */

import type { StructureMarkerDescriptor } from './StructureMarkerDescriptor';
import type { Vec2 } from '../math/Vec2';

export type StructureMarkerRenderer = {
  readonly label: string;
  /** Replace the marker set (`[]` clears); partitioned by `category`, one draw each. */
  setMarkers(descriptors: readonly StructureMarkerDescriptor[]): void;
  /** `fadeOpacity` scales the whole layer's alpha through `lib::fadeUniforms::applyFade`. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    fadeOpacity: number,
  ): void;
  markerCount(): number;
  /**
   * One ring-pick draw per category into the caller's pass, which must already bind
   * the r32uint pick attachment and a `depth24plus` depth attachment (this pipeline
   * writes + tests depth, so a galaxy in front of a ring claims the pixel). The pose
   * packs into this renderer's OWN `@group(0)` buffer, never the draw-time uniform,
   * which holds the last visual frame's stale camera; `@group(1)` is a dummy zeroed
   * FadeUniforms, since every declared group must be bound.
   */
  pickRing(passEncoder: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
