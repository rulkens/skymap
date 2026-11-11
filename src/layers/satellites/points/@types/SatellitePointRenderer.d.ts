/**
 * SatellitePointRenderer — one additive dot per satellite into the depthless HDR target; `draw`
 * extrapolates the last sweep in the vertex stage, so frames between sweeps cost no CPU work.
 */
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { SatelliteSweep } from '../../sweep/@types/SatelliteSweep';
import type { SatellitePointFrame } from './SatellitePointFrame';

export type SatellitePointRenderer = Renderer & {
  upload(sweep: SatelliteSweep, classCode: Uint8Array, profileCode: Uint8Array): void;
  /** Replaces the GPU profile table (`packSatelliteProfiles`); never between encoded passes. */
  writeProfiles(table: Float32Array): void;
  uploaded(): SatelliteSweep | null;
  clear(): void;
  draw(pass: GPURenderPassEncoder, frame: SatellitePointFrame): void;
  /** The same dots as pick ids, into the overlay pick target; `frame` is the pick window's. */
  drawPick(pass: GPURenderPassEncoder, frame: SatellitePointFrame): void;
};
