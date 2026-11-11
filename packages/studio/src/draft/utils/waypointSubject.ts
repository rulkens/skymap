/** A flyPath's waypoint as its row sees it, with what it takes from the path; `index` must be in range. */
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { RowSubjects } from '../../@types/rows/RowSubjects';

export function waypointSubject(
  fly: Extract<Effect, { kind: 'flyPath' }>,
  index: number,
): RowSubjects['waypoint'] {
  return {
    ...fly.waypoints[index]!,
    last: index === fly.waypoints.length - 1,
    // buildPathTrack: a waypoint's linger, else the path's, else none.
    pathLinger: fly.linger ?? 0,
  };
}
