/**
 * buildMissionTrails — every loaded craft's trails: the whole tessellated track about the Sun,
 * and one piece about each planet the craft stays near. Positions are Mpc in f64 relative to
 * the piece's centre body, with vertex times. Run by the renderer when the ephemeris version
 * changes, never per frame.
 */

import type { CraftTrail } from '../@types/CraftTrail';
import { SAMPLED_BODIES } from '../../../../data/bodies/sampledBodies';
import { MISSION_TRAIL_MAX_SAG_KM } from '../data/missionTrailStyle';
import { TRAIL_CENTRES } from '../data/trailCentres';
import { tessellateTrack } from '../utils/tessellateTrack';
import { trackKmToMpc } from '../utils/trackKmToMpc';
import { trailStaysOf } from '../utils/trailStaysOf';
import { nearTrailPiece } from './nearTrailPiece';
import { trajectoryRegistry } from '../../../../services/bodies/trajectoryRegistry';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

// A sampled track is Sun-centred (`SampledTrack.posKm`), so a trail cut straight from it is too.
const TRACK_CENTRE_ID = asSceneBodyId('sun');

export function buildMissionTrails(): CraftTrail[] {
  const out: CraftTrail[] = [];
  for (const { id } of SAMPLED_BODIES) {
    const track = trajectoryRegistry.get(id);
    if (track === undefined) continue;
    const { tDays, posKm } = tessellateTrack(track, MISSION_TRAIL_MAX_SAG_KM);
    const whole = { id, centreId: TRACK_CENTRE_ID, tDays, relMpc: trackKmToMpc(posKm) };
    const near = trailStaysOf(track, TRAIL_CENTRES, bodyPositionMpcAt).map((stay) =>
      nearTrailPiece(id, track, stay, bodyPositionMpcAt),
    );
    out.push({ id, whole, near });
  }
  return out;
}
