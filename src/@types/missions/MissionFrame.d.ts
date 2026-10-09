/**
 * MissionFrame — the sphere the mission camera fits this instant (centre and radius, Mpc) and
 * the stop whose planet it frames with the craft (null when it frames the Sun).
 */

import type { Vec3 } from '../math/Vec3';
import type { MissionStop } from './MissionStop';

export type MissionFrame = {
  readonly aim: Vec3;
  readonly radiusMpc: number;
  readonly stop: MissionStop | null;
};
