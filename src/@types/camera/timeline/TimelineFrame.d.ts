/**
 * TimelineFrame — the sphere the timeline camera fits this instant (centre and radius, Mpc) and
 * the stop whose planet it frames with the craft (null when it frames the Sun).
 */

import type { Vec3 } from '../../math/Vec3';
import type { TimelineStop } from './TimelineStop';

export type TimelineFrame = {
  readonly aim: Vec3;
  readonly radiusMpc: number;
  readonly stop: TimelineStop | null;
};
