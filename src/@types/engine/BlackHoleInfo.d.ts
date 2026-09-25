import type { BlackHoleId } from '../data/blackHole/BlackHoleId';
import type { Vec3 } from '../math/Vec3';

/**
 * BlackHoleInfo — the display-ready projection of a selected/hovered black
 * hole, so the InfoCard renders mass and horizon without importing physics.
 */
export type BlackHoleInfo = {
  readonly type: 'blackHole';
  readonly id: BlackHoleId;
  readonly label: string;
  readonly detailLabel: string;
  readonly positionMpc: Vec3;
  readonly schwarzschildRadiusM: number;
  readonly massSolar: number;
};
