import { laneColorCss } from './laneColorCss';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { SAMPLED_BODIES } from '../../../data/missions/spacecraftBodies';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import type { TimelineLane } from '../../../@types/exhibits/TimelineLane';

/**
 * One lane per craft, in order of first event. Label and colour are looked up, never
 * authored: the colour is the craft's trail tint, so panel and scene share one source.
 */
export function timelineLanes(events: readonly MissionEvent[]): readonly TimelineLane[] {
  const ids = [...new Set(events.map((e) => e.bodyId))];
  return ids.map((bodyId) => {
    const label = SCENE_MESH_BODIES.find((b) => b.id === bodyId)?.label ?? bodyId;
    const trailColor = SAMPLED_BODIES.find((b) => b.id === bodyId)?.trailColor;
    return {
      bodyId,
      label,
      color: trailColor ? laneColorCss(trailColor) : '#a8d0ff',
    };
  });
}
