import { laneColorCss } from './laneColorCss';
import { SAMPLED_BODIES } from '../../../data/missions/spacecraftBodies';
import { findByIdOrThrow } from '../../object/findByIdOrThrow';
import type { MissionTimeline } from '../../../@types/exhibits/MissionTimeline';
import type { TimelineLane } from '../../../@types/exhibits/TimelineLane';

/**
 * One lane per craft, in the given order. The colour is looked up, never authored: it is the
 * craft's trail tint, so panel and scene share one source, and a craft without a trail throws.
 */
export function timelineLanes(crafts: MissionTimeline['crafts']): readonly TimelineLane[] {
  return crafts.map(({ bodyId, label }) => ({
    bodyId,
    label,
    color: laneColorCss(findByIdOrThrow(SAMPLED_BODIES, bodyId, 'timelineLanes').trailColor),
  }));
}
