/**
 * MissionTrailRenderer — additive screen-space trails for sampled spacecraft,
 * into the depthless HDR target. Geometry is uploaded once per ephemeris load
 * (`setTracks`); each frame only chooses how much of it to draw.
 */

import type { Renderer } from '../Renderer';
import type { MissionTrailDrawArgs } from './MissionTrailDrawArgs';
import type { MissionTrailGeometry } from './MissionTrailGeometry';

export type MissionTrailRenderer = Renderer & {
  /** Replace every craft's uploaded vertices. */
  setTracks(tracks: readonly MissionTrailGeometry[]): void;
  draw(pass: GPURenderPassEncoder, args: MissionTrailDrawArgs): void;
};
