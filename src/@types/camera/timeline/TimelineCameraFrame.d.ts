/**
 * TimelineCameraFrame — the zero-offset camera geometry of the timeline frame: where the camera
 * looks (Mpc), the direction it looks along, the two axes the visitor's yaw and pitch turn
 * about, and the fitted distance (Mpc). `stop` and `cruise` name the view: the stop framed
 * (null = the Sun) and whether it looks along the cruise bearing rather than a flyby's.
 */

import type { TimelineStop } from './TimelineStop';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

export type TimelineCameraFrame = {
  readonly aim: Vec3;
  readonly viewDirection: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly distance: number;
  readonly stop: TimelineStop | null;
  readonly cruise: boolean;
};
