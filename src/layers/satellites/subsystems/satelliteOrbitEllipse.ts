/**
 * satelliteOrbitEllipse — the satellite's osculating ellipse at a sim instant, in the world: SGP4's
 * TEME state through `ellipseFromStateVector`, then the same rotation the dots and the camera-follow
 * use. The ellipse passes exactly through the satellite, and J2 turning the plane is free because
 * it is rebuilt every frame.
 */
import { sgp4, type json2satrec } from '../load/satelliteJsCore';
import { temeKmToWorldMpc } from './temeKmToWorldMpc';
import { ellipseFromStateVector } from '../../../utils/orbit/ellipseFromStateVector';
import { EARTH_GM_KM3_S2 } from '../../../data/earthGmKm3S2';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { OrbitConic } from '../../../@types/scene/OrbitConic';

const MS_PER_MINUTE = 60_000;

export function satelliteOrbitEllipse(
  satrec: ReturnType<typeof json2satrec>,
  epochMs: number,
  simDays: number,
  temeToWorld: Readonly<Mat3>,
  earthMpc: Readonly<Vec3>,
): OrbitConic | null {
  const state = sgp4(satrec, (julianDaysToUnixMs(simDays) - epochMs) / MS_PER_MINUTE);
  if (state === null) return null;
  const { position: p, velocity: v } = state;
  const ellipse = ellipseFromStateVector([p.x, p.y, p.z], [v.x, v.y, v.z], EARTH_GM_KM3_S2);
  if (ellipse === null) return null;
  const origin: Vec3 = [0, 0, 0];
  return {
    centerMpc: temeKmToWorldMpc(temeToWorld, ellipse.centerOffset, earthMpc),
    semiMajorMpc: temeKmToWorldMpc(temeToWorld, ellipse.semiMajor, origin),
    semiMinorMpc: temeKmToWorldMpc(temeToWorld, ellipse.semiMinor, origin),
    eccentricity: ellipse.eccentricity,
    meanAnomalyRad: ellipse.meanAnomalyRad,
  };
}
