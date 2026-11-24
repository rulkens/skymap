/**
 * nearTrailPiece — the stretch of a craft's trail inside a planet's reach, drawn about that
 * planet. The relative track is built first and tessellated after: cutting the Sun-frame line
 * and subtracting the planet afterwards would keep the planet's orbital curvature (hundreds of
 * km of sag per step) in the line.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SampledTrack } from '../../../../@types/scene/SampledTrack';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { hermiteTrackAt } from '../../../../utils/orbit/hermiteTrackAt';
import { bodyVelocityKmS } from '../../../../utils/orbit/bodyVelocityKmS';
import { hermiteTrackVelAt } from '../../missionCamera/utils/hermiteTrackVelAt';
import type { MissionTrailGeometry } from '../@types/MissionTrailGeometry';
import type { TrailStay } from '../@types/TrailStay';
import { MISSION_TRAIL_MAX_SAG_KM } from '../data/missionTrailStyle';
import { tessellateTrack } from '../utils/tessellateTrack';
import { trackKmToMpc } from '../utils/trackKmToMpc';

export function nearTrailPiece(
  track: SampledTrack,
  stay: TrailStay,
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): MissionTrailGeometry {
  const { t0Days, t1Days, centreId } = stay;
  const inside: number[] = [];
  for (const t of track.tDays) if (t > t0Days && t < t1Days) inside.push(t);
  const times = [t0Days, ...inside, t1Days];

  const posKm = new Float64Array(3 * times.length);
  const velKmS = new Float32Array(3 * times.length);
  times.forEach((t, i) => {
    const craftPos = hermiteTrackAt(track, t);
    const craftVel = hermiteTrackVelAt(track, t);
    const sun = positionAt('sun', t);
    const body = positionAt(centreId, t);
    const bodyVel = bodyVelocityKmS(centreId, t, positionAt);
    for (let k = 0; k < 3; k++) {
      // The track is Sun-centred, so the centre's offset from the Sun is what comes off.
      posKm[3 * i + k] = craftPos[k]! - (body[k]! - sun[k]!) / SCALE_UNITS.KM_TO_MPC;
      velKmS[3 * i + k] = craftVel[k]! - bodyVel[k]!;
    }
  });

  const tess = tessellateTrack(
    { id: track.id, tDays: Float64Array.from(times), posKm, velKmS },
    MISSION_TRAIL_MAX_SAG_KM,
  );
  return { centreId, tDays: tess.tDays, relMpc: trackKmToMpc(tess.posKm) };
}
