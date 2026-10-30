/**
 * satelliteOrbitEllipse — the satellite's osculating ellipse at a sim instant, in the world: SGP4's
 * TEME state through `ellipseFromStateVector`, then the same rotation the dots and the camera-follow
 * use. The ellipse passes exactly through the satellite, and J2 turning the plane is free because
 * it is rebuilt every frame. km become Mpc BEFORE Earth's heliocentric position joins the centre,
 * as in `satellitePositionMpc`, or the offset would round off an au magnitude.
 */
import { sgp4 } from '../load/satelliteJsCore';
import { ellipseFromStateVector } from '../../../utils/orbit/ellipseFromStateVector';
import { EARTH_GM_KM3_S2 } from '../../../data/earthGmKm3S2';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { OrbitConic } from '../../../@types/scene/OrbitConic';
import type { TrackedSatellite } from '../@types/TrackedSatellite';

const MS_PER_MINUTE = 60_000;

const toWorldMpc = (m: Readonly<Mat3>, [x, y, z]: Readonly<Vec3>, base: Readonly<Vec3>): Vec3 => [
  base[0] + (m[0] * x + m[3] * y + m[6] * z) * SCALE_UNITS.KM_TO_MPC,
  base[1] + (m[1] * x + m[4] * y + m[7] * z) * SCALE_UNITS.KM_TO_MPC,
  base[2] + (m[2] * x + m[5] * y + m[8] * z) * SCALE_UNITS.KM_TO_MPC,
];

export function satelliteOrbitEllipse(
  satellite: Pick<TrackedSatellite, 'satrec' | 'epochMs'>,
  simDays: number,
  temeToWorld: Readonly<Mat3>,
  earthMpc: Readonly<Vec3>,
): OrbitConic | null {
  const state = sgp4(
    satellite.satrec,
    (julianDaysToUnixMs(simDays) - satellite.epochMs) / MS_PER_MINUTE,
  );
  if (state === null) return null;
  const { position: p, velocity: v } = state;
  const ellipse = ellipseFromStateVector([p.x, p.y, p.z], [v.x, v.y, v.z], EARTH_GM_KM3_S2);
  if (ellipse === null) return null;
  const origin: Vec3 = [0, 0, 0];
  return {
    centerMpc: toWorldMpc(temeToWorld, ellipse.centerOffset, earthMpc),
    semiMajorMpc: toWorldMpc(temeToWorld, ellipse.semiMajor, origin),
    semiMinorMpc: toWorldMpc(temeToWorld, ellipse.semiMinor, origin),
    eccentricity: ellipse.eccentricity,
    meanAnomalyRad: ellipse.meanAnomalyRad,
  };
}
