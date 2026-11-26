import { laneColorCss } from './laneColorCss';
import type { ExhibitTimelineData } from '../../../@types/exhibits/timeline/ExhibitTimelineData';
import type { TimelineLane } from '../../../@types/exhibits/timeline/TimelineLane';

/** One lane per data lane, in the given order, its trail tint turned into the CSS the panel paints. */
export function timelineLanes(lanes: ExhibitTimelineData['lanes']): readonly TimelineLane[] {
  return lanes.map(({ bodyId, label, color }) => ({ bodyId, label, color: laneColorCss(color) }));
}
