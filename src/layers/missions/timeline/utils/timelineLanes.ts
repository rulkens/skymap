import { laneColorCss } from './laneColorCss';
import type { MissionTimeline } from '../@types/MissionTimeline';
import type { TimelineLane } from '../@types/TimelineLane';

/** One lane per data lane, in the given order, its trail tint turned into the CSS the panel paints. */
export function timelineLanes(lanes: MissionTimeline['lanes']): readonly TimelineLane[] {
  return lanes.map(({ bodyId, label, color }) => ({ bodyId, label, color: laneColorCss(color) }));
}
