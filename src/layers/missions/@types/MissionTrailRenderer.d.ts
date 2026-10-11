/**
 * MissionTrailRenderer — additive screen-space trails for sampled spacecraft,
 * into the depthless HDR target. Geometry is built and uploaded once per
 * ephemeris version (`ensureTracks`); each frame is `beginFrame` then one
 * `drawTrail` per craft, which take positional arguments so nothing allocates.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { MissionTrailFrame } from './MissionTrailFrame';
import type { MissionTrailGeometry } from './MissionTrailGeometry';

export type MissionTrailRenderer = Renderer & {
  /** The uploaded tracks, rebuilt about `sunMpc` only when `version` differs. */
  ensureTracks(version: number, sunMpc: Readonly<Vec3>): ReadonlyMap<string, MissionTrailGeometry>;
  beginFrame(pass: GPURenderPassEncoder, frame: MissionTrailFrame): void;
  /**
   * Draw the first `segmentCount` segments of `id`'s trail, then a head segment
   * from vertex `segmentCount` to `headMpc` (the craft's own position) when given.
   */
  drawTrail(
    pass: GPURenderPassEncoder,
    id: string,
    color: Readonly<Vec3>,
    opacity: number,
    segmentCount: number,
    headMpc: Readonly<Vec3> | null,
  ): void;
};
