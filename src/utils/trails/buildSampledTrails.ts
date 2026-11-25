/**
 * buildSampledTrails — the trails of those `ids` with a loaded track: the whole tessellated
 * track about the Sun, and one piece about each planet the body stays near. Positions are Mpc in
 * f64 relative to the piece's centre body, with vertex times. Run by the renderer when the
 * track-store version changes, never per frame.
 */

import type { SampledTrail } from '../../@types/rendering/sampledTrailRenderer/SampledTrail';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import { SAMPLED_BODIES } from '../../data/bodies/sampledBodies';
import { SAMPLED_TRAIL_MAX_SAG_KM, TRAIL_STAY_FADE } from '../../data/bodies/sampledTrailStyle';
import { TRAIL_CENTRES } from '../../data/bodies/trailCentres';
import { tessellateTrack } from './tessellateTrack';
import { trackKmToMpc } from './trackKmToMpc';
import { trailStaysOf } from './trailStaysOf';
import { nearTrailPiece } from './nearTrailPiece';
import { trajectoryRegistry } from '../../services/bodies/trajectoryRegistry';
import { bodyPositionMpcAt } from '../exhibits/mission/bodyPositionMpcAt';
import { asSceneBodyId } from '../scene/asSceneBodyId';
import { findByIdOrThrow } from '../object/findByIdOrThrow';
import { withLaunchAscent } from '../orbit/withLaunchAscent';

// A sampled track is Sun-centred (`SampledTrack.posKm`), so a trail cut straight from it is too.
const TRACK_CENTRE_ID = asSceneBodyId('sun');

export function buildSampledTrails(ids: readonly SceneBodyId[]): SampledTrail[] {
  const out: SampledTrail[] = [];
  for (const id of ids) {
    const loaded = trajectoryRegistry.get(id);
    if (loaded === undefined) continue;
    const body = findByIdOrThrow(SAMPLED_BODIES, id, 'buildSampledTrails');
    const track = withLaunchAscent(body, loaded, bodyPositionMpcAt);
    const endDays = track.tDays[track.tDays.length - 1]!;
    const { tDays, posKm } = tessellateTrack(track, SAMPLED_TRAIL_MAX_SAG_KM);
    const whole = { centreId: TRACK_CENTRE_ID, tDays, relMpc: trackKmToMpc(posKm) };
    const near = trailStaysOf(track, TRAIL_CENTRES, bodyPositionMpcAt).map((stay) => {
      const { t0Days, t1Days } = stay;
      const fadedDays = Math.min(t1Days + TRAIL_STAY_FADE * (t1Days - t0Days), endDays);
      const piece = nearTrailPiece(track, { ...stay, t1Days: fadedDays }, bodyPositionMpcAt);
      return { piece, leaveDays: t1Days };
    });
    out.push({ id, whole, near });
  }
  return out;
}
