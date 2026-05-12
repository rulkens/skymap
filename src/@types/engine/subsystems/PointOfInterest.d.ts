import type { Vec3 } from '../../math/Vec3';
import type { PoiCategory } from './PoiCategory';

export type PointOfInterest = {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly worldPos: Vec3;
  /** Crosshair half-length in Mpc.  Omit to draw label only. */
  readonly crosshairSizeMpc?: number;
};
