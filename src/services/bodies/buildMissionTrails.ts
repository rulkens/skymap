/**
 * buildMissionTrails — every loaded craft's tessellated trail as world-Mpc
 * positions in f64 plus vertex times. Run by the renderer when the ephemeris
 * version changes, never per frame.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { MissionTrailGeometry } from '../../@types/rendering/missionTrailRenderer/MissionTrailGeometry';
import { SAMPLED_BODIES } from '../../data/missions/spacecraftBodies';
import { MISSION_TRAIL_MAX_SAG_KM } from '../../data/missions/missionTrailStyle';
import { tessellateTrack } from '../../utils/orbit/tessellateTrack';
import { trackKmToWorldMpc } from '../../utils/orbit/trackKmToWorldMpc';
import { trajectoryRegistry } from './trajectoryRegistry';

export function buildMissionTrails(sunMpc: Readonly<Vec3>): MissionTrailGeometry[] {
  const out: MissionTrailGeometry[] = [];
  for (const { id } of SAMPLED_BODIES) {
    const track = trajectoryRegistry.get(id);
    if (track === undefined) continue;
    const { tDays, posKm } = tessellateTrack(track, MISSION_TRAIL_MAX_SAG_KM);
    out.push({ id, tDays, posMpc: trackKmToWorldMpc(posKm, sunMpc) });
  }
  return out;
}
