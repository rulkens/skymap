import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Sagittarius's two arms as polylines, heliocentric equatorial kpc, each from the remnant outward. */
export type SagittariusCentrelines = {
  readonly leadingKpc: Vec3[];
  readonly trailingKpc: Vec3[];
  /** The median arm bin's RMS spread about its mean: the arms' width, the pick ribbon's floor. */
  readonly widthKpc: number;
};
