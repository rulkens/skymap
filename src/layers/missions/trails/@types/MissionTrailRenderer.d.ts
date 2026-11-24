/**
 * MissionTrailRenderer — additive screen-space trails for sampled spacecraft,
 * into the depthless HDR target. Geometry is built and uploaded once per
 * ephemeris version (`ensureTracks`); each frame is `beginFrame` then one
 * `drawTrail` per craft, which take positional arguments so nothing allocates.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MissionTrailFrame } from './MissionTrailFrame';
import type { CraftTrail } from './CraftTrail';

export type MissionTrailRenderer = Renderer & {
  /** The uploaded tracks, rebuilt only when `version` differs. */
  ensureTracks(version: number): ReadonlyMap<string, CraftTrail>;
  beginFrame(pass: GPURenderPassEncoder, frame: MissionTrailFrame): void;
  /**
   * Draw the first `segmentCount` segments of `id`'s trail about `centreMpc` (its
   * centre body's position now), then a head segment from vertex `segmentCount`
   * to `headMpc` (the craft's own world position) when given.
   */
  drawTrail(
    pass: GPURenderPassEncoder,
    id: string,
    color: Readonly<Vec3>,
    opacity: number,
    segmentCount: number,
    centreMpc: Readonly<Vec3>,
    headMpc: Readonly<Vec3> | null,
  ): void;
};
