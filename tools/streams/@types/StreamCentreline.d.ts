import type { Vec3 } from '../../../src/@types/math/Vec3';

/** A stream's pick geometry: its simplified line and the ribbon width that keeps the track inside it. */
export type StreamCentreline = {
  readonly centrelineMpc: Vec3[];
  readonly ribbonWidthKpc: number;
};
