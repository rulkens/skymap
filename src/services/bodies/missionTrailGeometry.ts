/**
 * missionTrailGeometry — every loaded craft's tessellated trail, built and
 * uploaded to the renderer once per `trajectoryRegistry.version()` (or when the
 * renderer is replaced). Cached at module level so the per-frame pass only reads.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { MissionTrailBuilt } from '../../@types/scene/MissionTrailBuilt';
import type { MissionTrailRenderer } from '../../@types/rendering/missionTrailRenderer/MissionTrailRenderer';
import { SAMPLED_BODIES } from '../../data/missions/spacecraftBodies';
import { MISSION_TRAIL_MAX_SAG_KM } from '../../data/missions/missionTrailStyle';
import { tessellateTrack } from '../../utils/orbit/tessellateTrack';
import { trackKmToWorldMpc } from '../../utils/orbit/trackKmToWorldMpc';
import { trajectoryRegistry } from './trajectoryRegistry';

let built: {
  readonly renderer: MissionTrailRenderer;
  readonly version: number;
  readonly trails: ReadonlyMap<string, MissionTrailBuilt>;
} | null = null;

export function missionTrailGeometry(
  renderer: MissionTrailRenderer,
  sunMpc: Readonly<Vec3>,
): ReadonlyMap<string, MissionTrailBuilt> {
  const version = trajectoryRegistry.version();
  if (built !== null && built.renderer === renderer && built.version === version) {
    return built.trails;
  }
  const trails = new Map<string, MissionTrailBuilt>();
  for (const { id } of SAMPLED_BODIES) {
    const track = trajectoryRegistry.get(id);
    if (track === undefined) continue;
    const { tDays, posKm } = tessellateTrack(track, MISSION_TRAIL_MAX_SAG_KM);
    trails.set(id, { tDays, posMpc: trackKmToWorldMpc(posKm, sunMpc) });
  }
  renderer.setTracks([...trails].map(([id, t]) => ({ id, posMpc: t.posMpc })));
  built = { renderer, version, trails };
  return trails;
}
