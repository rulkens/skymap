import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

/** A maximal time interval (UT Julian date) in which a craft is within a centre's reach. */
export type TrailStay = {
  readonly centreId: SceneBodyId;
  readonly t0Days: number;
  readonly t1Days: number;
};
