import type { SceneBodyId } from '../../scene/SceneBodyId';

/** A maximal time interval (UT Julian date) in which a body is within a centre's reach. */
export type TrailStay = {
  readonly centreId: SceneBodyId;
  readonly t0Days: number;
  readonly t1Days: number;
};
