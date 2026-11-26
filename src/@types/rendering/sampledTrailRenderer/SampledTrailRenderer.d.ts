/**
 * SampledTrailRenderer — additive screen-space trails for bodies on sampled tracks,
 * into the depthless HDR target. Geometry is built and uploaded once per
 * track-store version (`ensureTracks`); each frame is `beginFrame` then one
 * `drawTrail` per piece drawn (`trailDrawsAt`), at most `MAX_TRAILS` per `beginFrame` (per view).
 */

import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { SceneBodyId } from '../../scene/SceneBodyId';
import type { Renderer } from '../Renderer';
import type { SampledTrailFrame } from './SampledTrailFrame';
import type { SampledTrail } from './SampledTrail';
import type { SampledTrailGeometry } from './SampledTrailGeometry';

export type SampledTrailRenderer = Renderer & {
  /** The uploaded trails of those `ids` with a loaded track, rebuilt only when `version`
   * differs; `ids` must be the same list on every call. */
  ensureTracks(version: number, ids: readonly SceneBodyId[]): readonly SampledTrail[];
  beginFrame(pass: GPURenderPassEncoder, frame: SampledTrailFrame): void;
  /**
   * `centreMpc` is the piece's centre body now; the head runs from vertex `segmentCount` to
   * `headMpc`. The line fades to nothing within `fadeRadiusMpc` of `fadeMpc` (0: no fade).
   */
  drawTrail(
    pass: GPURenderPassEncoder,
    piece: SampledTrailGeometry,
    color: Readonly<Vec3>,
    opacity: number,
    segmentCount: number,
    centreMpc: Readonly<Vec3>,
    headMpc: Readonly<Vec3> | null,
    fadeMpc: Readonly<Vec3>,
    fadeRadiusMpc: number,
  ): void;
};
