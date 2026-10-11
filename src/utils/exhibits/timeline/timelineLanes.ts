import { laneColorCss } from './laneColorCss';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { SAMPLED_BODIES } from '../../../data/missions/spacecraftBodies';
import type { TimelineLane } from '../../../@types/exhibits/TimelineLane';

/**
 * One lane per craft id, in the given order. Label and colour are looked up, never
 * authored: the colour is the craft's trail tint, so panel and scene share one source.
 */
export function timelineLanes(craftIds: readonly string[]): readonly TimelineLane[] {
  return craftIds.map((bodyId) => {
    const label = SCENE_MESH_BODIES.find((b) => b.id === bodyId)?.label ?? bodyId;
    const trailColor = SAMPLED_BODIES.find((b) => b.id === bodyId)?.trailColor;
    return {
      bodyId,
      label,
      color: trailColor ? laneColorCss(trailColor) : '#a8d0ff',
    };
  });
}
