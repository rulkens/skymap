/**
 * MissionTrailRenderer — additive screen-space trails for sampled spacecraft,
 * into the depthless HDR target. Geometry is built and uploaded once per
 * ephemeris version (`ensureTracks`); each frame is `beginFrame` then one
 * `drawTrail` per piece drawn (`trailDrawsAt`).
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MissionTrailFrame } from './MissionTrailFrame';
import type { CraftTrail } from './CraftTrail';
import type { MissionTrailGeometry } from './MissionTrailGeometry';

export type MissionTrailRenderer = Renderer & {
  /** The uploaded tracks, rebuilt only when `version` differs. */
  ensureTracks(version: number): ReadonlyMap<string, CraftTrail>;
  beginFrame(pass: GPURenderPassEncoder, frame: MissionTrailFrame): void;
  /** `centreMpc` is the piece's centre body now; the head runs from vertex `segmentCount` to `headMpc`. */
  drawTrail(
    pass: GPURenderPassEncoder,
    piece: MissionTrailGeometry,
    color: Readonly<Vec3>,
    opacity: number,
    segmentCount: number,
    centreMpc: Readonly<Vec3>,
    headMpc: Readonly<Vec3> | null,
  ): void;
};
