/**
 * buildMissionTrails — every loaded craft's trails: the whole tessellated track about the Sun,
 * and one piece about each planet the craft stays near. Positions are Mpc in f64 relative to
 * the piece's centre body, with vertex times. Run by the renderer when the ephemeris version
 * changes, never per frame.
 */

import type { CraftTrail } from '../@types/CraftTrail';
import { SAMPLED_BODIES } from '../../../../data/bodies/sampledBodies';
import { MISSION_TRAIL_MAX_SAG_KM, TRAIL_LEAVE_FADE } from '../data/missionTrailStyle';
import { TRAIL_CENTRES } from '../data/trailCentres';
import { tessellateTrack } from '../utils/tessellateTrack';
import { trackKmToMpc } from '../utils/trackKmToMpc';
import { trailStaysOf } from '../utils/trailStaysOf';
import { nearTrailPiece } from './nearTrailPiece';
import { trajectoryRegistry } from '../../../../services/bodies/trajectoryRegistry';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';
import { withLaunchAscent } from '../../../../utils/orbit/withLaunchAscent';

// A sampled track is Sun-centred (`SampledTrack.posKm`), so a trail cut straight from it is too.
const TRACK_CENTRE_ID = asSceneBodyId('sun');

export function buildMissionTrails(): CraftTrail[] {
  const out: CraftTrail[] = [];
  for (const body of SAMPLED_BODIES) {
    const { id } = body;
    const loaded = trajectoryRegistry.get(id);
    if (loaded === undefined) continue;
    const track = withLaunchAscent(body, loaded, bodyPositionMpcAt);
    const endDays = track.tDays[track.tDays.length - 1]!;
    const { tDays, posKm } = tessellateTrack(track, MISSION_TRAIL_MAX_SAG_KM);
    const whole = { centreId: TRACK_CENTRE_ID, tDays, relMpc: trackKmToMpc(posKm) };
    const near = trailStaysOf(track, TRAIL_CENTRES, bodyPositionMpcAt).map((stay) => {
      const { t0Days, t1Days } = stay;
      const fadedDays = Math.min(t1Days + TRAIL_LEAVE_FADE * (t1Days - t0Days), endDays);
      const piece = nearTrailPiece(track, { ...stay, t1Days: fadedDays }, bodyPositionMpcAt);
      return { piece, leaveDays: t1Days };
    });
    out.push({ id, whole, near });
  }
  return out;
}
