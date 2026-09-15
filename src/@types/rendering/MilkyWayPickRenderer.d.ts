/**
 * Public handle returned by `createMilkyWayPickRenderer`: the visible cloud has no
 * pick pipeline, so this stamps one invisible billboard at the galactic centre into
 * the r32uint pick texture, identity `(Source.MilkyWay << 26) | PICK_SENTINEL_OFFSET`.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

export type MilkyWayPickRenderer = {
  readonly label: string;
  /**
   * Record ONE pick billboard at `MILKY_WAY_CENTER_WORLD`, sized in the vertex
   * shader from the camera facts; gating on disc visibility is the caller's. The
   * camera arguments pack into this renderer's OWN 96-byte `@group(0)` buffer, never
   * the draw-time uniform, which holds the last visual frame's stale pose.
   * `@group(1)` takes a dummy zeroed FadeUniforms: every declared group must be bound.
   */
  pickMilkyWay(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
  ): void;
  /** Release GPU resources. No-op under a null device. */
  destroy(): void;
};
