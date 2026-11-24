/**
 * buildMissionTrails — every loaded craft's tessellated trail as Mpc positions
 * in f64 relative to the trail's centre body, plus vertex times. Run by the
 * renderer when the ephemeris version changes, never per frame.
 */

import type { MissionTrailGeometry } from '../@types/MissionTrailGeometry';
import { SAMPLED_BODIES } from '../../../../data/bodies/sampledBodies';
import { MISSION_TRAIL_MAX_SAG_KM } from '../data/missionTrailStyle';
import { tessellateTrack } from '../utils/tessellateTrack';
import { trackKmToMpc } from '../utils/trackKmToMpc';
import { trajectoryRegistry } from '../../../../services/bodies/trajectoryRegistry';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

// A sampled track is Sun-centred (`SampledTrack.posKm`), so a trail cut straight from it is too.
const TRACK_CENTRE_ID = asSceneBodyId('sun');

export function buildMissionTrails(): MissionTrailGeometry[] {
  const out: MissionTrailGeometry[] = [];
  for (const { id } of SAMPLED_BODIES) {
    const track = trajectoryRegistry.get(id);
    if (track === undefined) continue;
    const { tDays, posKm } = tessellateTrack(track, MISSION_TRAIL_MAX_SAG_KM);
    out.push({ id, centreId: TRACK_CENTRE_ID, tDays, relMpc: trackKmToMpc(posKm) });
  }
  return out;
}
