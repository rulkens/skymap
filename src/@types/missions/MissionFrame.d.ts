/**
 * MissionFrame — the sphere the mission camera fits this instant (centre and radius, Mpc), with
 * the stops it blends between: `behind` is the planet stop just passed (null when that stop has
 * no planet), `ahead` the next stop (null past the last), `weight` how far the hand-off from
 * `behind` to `ahead` has run.
 */

import type { Vec3 } from '../math/Vec3';
import type { MissionStop } from './MissionStop';

export type MissionFrame = {
  readonly aim: Vec3;
  readonly radiusMpc: number;
  readonly behind: MissionStop | null;
  readonly ahead: MissionStop | null;
  readonly weight: number;
};
