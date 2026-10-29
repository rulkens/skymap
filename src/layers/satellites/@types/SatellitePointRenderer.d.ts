/**
 * SatellitePointRenderer — one additive dot per satellite into the depthless HDR target. `upload`
 * takes each new worker sweep (the valid objects only); `draw` extrapolates it to the frame's
 * instant in the vertex stage, so frames between sweeps cost no CPU work per satellite.
 */
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { SatelliteSweep } from './SatelliteSweep';
import type { SatellitePointFrame } from './SatellitePointFrame';

export type SatellitePointRenderer = Renderer & {
  upload(sweep: SatelliteSweep): void;
  /** The sweep last uploaded, or null after `clear`. */
  uploaded(): SatelliteSweep | null;
  clear(): void;
  draw(pass: GPURenderPassEncoder, frame: SatellitePointFrame): void;
};
