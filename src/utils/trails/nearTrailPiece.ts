/**
 * nearTrailPiece — the stretch of a sampled body's trail inside a planet's reach, drawn about that
 * planet. The relative track is built first and tessellated after: cutting the Sun-frame line
 * and subtracting the planet afterwards would keep the planet's orbital curvature (hundreds of
 * km of sag per step) in the line.
 */

import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { SampledTrack } from '../../@types/scene/SampledTrack';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { hermiteTrackAt } from '../orbit/hermiteTrackAt';
import { bodyVelocityKmS } from '../orbit/bodyVelocityKmS';
import { hermiteTrackVelAt } from '../orbit/hermiteTrackVelAt';
import type { SampledTrailGeometry } from '../../@types/rendering/sampledTrailRenderer/SampledTrailGeometry';
import type { TrailStay } from '../../@types/rendering/sampledTrailRenderer/TrailStay';
import { SAMPLED_TRAIL_MAX_SAG_KM } from '../../data/bodies/sampledTrailStyle';
import { tessellateTrack } from './tessellateTrack';
import { trackKmToMpc } from './trackKmToMpc';

export function nearTrailPiece(
  track: SampledTrack,
  stay: TrailStay,
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): SampledTrailGeometry {
  const { t0Days, t1Days, centreId } = stay;
  const inside: number[] = [];
  for (const t of track.tDays) if (t > t0Days && t < t1Days) inside.push(t);
  const times = [t0Days, ...inside, t1Days];

  const posKm = new Float64Array(3 * times.length);
  const velKmS = new Float32Array(3 * times.length);
  times.forEach((t, i) => {
    const bodyPos = hermiteTrackAt(track, t);
    const bodyVel = hermiteTrackVelAt(track, t);
    const sun = positionAt('sun', t);
    const centre = positionAt(centreId, t);
    const centreVel = bodyVelocityKmS(centreId, t, positionAt);
    for (let k = 0; k < 3; k++) {
      // The track is Sun-centred, so the centre's offset from the Sun is what comes off.
      posKm[3 * i + k] = bodyPos[k]! - (centre[k]! - sun[k]!) / SCALE_UNITS.KM_TO_MPC;
      velKmS[3 * i + k] = bodyVel[k]! - centreVel[k]!;
    }
  });

  const tess = tessellateTrack(
    { id: track.id, tDays: Float64Array.from(times), posKm, velKmS },
    SAMPLED_TRAIL_MAX_SAG_KM,
  );
  return { centreId, tDays: tess.tDays, relMpc: trackKmToMpc(tess.posKm) };
}
