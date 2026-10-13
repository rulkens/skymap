import { MISSION_EMPHASIS_DIM } from '../../data/missions/missionTrailStyle';

/** Opacity factor for a sampled craft: 1 when nothing, or it, is emphasised; else dimmed. */
export function emphasisDim(emphasis: string | null, bodyId: string): number {
  return emphasis === null || emphasis === bodyId ? 1 : MISSION_EMPHASIS_DIM;
}
