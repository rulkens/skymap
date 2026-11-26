/**
 * ExhibitTimelineData — a scrubbable timeline in the notes column. `lanes` is the tab
 * order (`[0]` opens), each with its trail tint (linear HDR, as a trail row carries it);
 * `events` are only the listed lanes'. The axis runs from the selected lane's launch to
 * `endIso`, or to the wall clock at opening. `cruise` is the bearing (yaw/pitch in the pose
 * basis) the timeline camera looks along away from planets.
 */

import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { TimelineEvent } from './TimelineEvent';

export type ExhibitTimelineData = {
  readonly heading: string;
  readonly lanes: readonly {
    readonly bodyId: string;
    readonly label: string;
    readonly color: Vec3;
  }[];
  readonly events: readonly TimelineEvent[];
  readonly endIso?: string;
  readonly cruise: { readonly yaw: number; readonly pitch: number };
};
