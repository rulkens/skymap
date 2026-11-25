import { laneColorCss } from './laneColorCss';
import type { MissionTimeline } from '../../../@types/exhibits/timeline/MissionTimeline';
import type { TimelineLane } from '../../../@types/exhibits/timeline/TimelineLane';

/** One lane per data lane, in the given order, its trail tint turned into the CSS the panel paints. */
export function timelineLanes(lanes: MissionTimeline['lanes']): readonly TimelineLane[] {
  return lanes.map(({ bodyId, label, color }) => ({ bodyId, label, color: laneColorCss(color) }));
}
