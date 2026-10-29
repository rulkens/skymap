/**
 * SatellitePointRenderer — one additive dot per satellite into the depthless HDR target. `upload`
 * takes each new worker sweep (the valid objects only, each with its catalog index and class); `draw` extrapolates it to the frame's
 * instant in the vertex stage, so frames between sweeps cost no CPU work per satellite.
 */
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { SatelliteSweep } from './SatelliteSweep';
import type { SatellitePointFrame } from './SatellitePointFrame';

export type SatellitePointRenderer = Renderer & {
  /** `classCode` is the catalog's column, indexed like the sweep. */
  upload(sweep: SatelliteSweep, classCode: Uint8Array): void;
  /** The sweep last uploaded, or null after `clear`. */
  uploaded(): SatelliteSweep | null;
  clear(): void;
  draw(pass: GPURenderPassEncoder, frame: SatellitePointFrame): void;
  /** The same dots as pick ids, into the overlay pick target; `frame` is the pick window's. */
  drawPick(pass: GPURenderPassEncoder, frame: SatellitePointFrame): void;
};
