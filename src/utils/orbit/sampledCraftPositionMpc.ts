/**
 * sampledCraftPositionMpc — a sampled body's world position at `simDays`. On the track from its
 * first sample; before it, a body with no launch holds that sample, and a launched one rises from
 * the pad (turning with Earth) to it. That sample, an hour after launch, sits ~260° east of the
 * pad round Earth: a straight blend would tunnel through the planet, so the Earth-relative radius
 * and great-circle angle are eased separately, each ending on the sample's own radial and
 * along-arc velocity. The radius goes up to a parking height first and holds it until the
 * last-minutes burn. Before launch it waits on the pad. `positionAt` is injected
 * (`bodyPositionMpcAt`) to place Earth and the Sun at other instants without an import cycle.
 */

import type { SampledBody } from '../../@types/scene/SampledBody';
import type { SampledTrack } from '../../@types/scene/SampledTrack';
import type { Vec3 } from '../../@types/math/Vec3';
import { orientationForBody } from '../../data/bodies/orientationForBody';
import { EARTH_DATUM_RADIUS_M } from '../../data/bodies/earthDatumRadiusM';
import { LAUNCH_CLIMB } from '../../data/orbit/launchClimb';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { SECONDS_PER_DAY } from '../../data/time/secondsPerDay';
import { surfacePointBodyFixed } from '../geo/surfacePointBodyFixed';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { smoothstep } from '../math/smoothstep';
import { isoToJulianDays } from '../time/isoToJulianDays';
import { bodyVelocityKmS } from './bodyVelocityKmS';
import { hermiteTrackAt } from './hermiteTrackAt';

// Earth's IAU-pole row never reads the position map.
const NO_POSITIONS = new Map<string, Vec3>();

export function sampledCraftPositionMpc(
  body: SampledBody,
  track: SampledTrack,
  simDays: number,
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): Vec3 {
  const k = SCALE_UNITS.KM_TO_MPC;
  const t0 = track.tDays[0]!;
  const { launch } = body;
  if (simDays >= t0 || !launch) {
    const km = hermiteTrackAt(track, simDays);
    const sun = positionAt('sun', simDays);
    return [sun[0] + km[0] * k, sun[1] + km[1] * k, sun[2] + km[2] * k];
  }

  // The join, Earth-relative (km, km/s): the track is Sun-centred, Earth's velocity a central
  // difference.
  const sun0 = positionAt('sun', t0);
  const earth0 = positionAt('earth', t0);
  const earthVelKmS = bodyVelocityKmS('earth', t0, positionAt);
  const joinKm: Vec3 = [0, 0, 0];
  const joinVelKmS: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    joinKm[i] = track.posKm[i]! + (sun0[i]! - earth0[i]!) / k;
    joinVelKmS[i] = track.velKmS[i]! - earthVelKmS[i]!;
  }

  const groundKm = EARTH_DATUM_RADIUS_M * 1e-3;
  const { latDeg, lonDeg } = launch.pad;
  const padDir = rotateVec3ByTightMat3(
    orientationForBody('earth', simDays, NO_POSITIONS),
    surfacePointBodyFixed(latDeg, lonDeg, 1),
  );
  const joinR = Math.hypot(...joinKm);
  const joinDir = normalize3(joinKm);
  const cos = dot3(padDir, joinDir);
  const theta = Math.acos(Math.min(Math.max(cos, -1), 1));
  // The great circle through pad and join: `perp` is a quarter turn from the pad toward the
  // join, `onward` the direction of travel at the join on the short way round.
  const perp = normalize3([
    joinDir[0] - cos * padDir[0],
    joinDir[1] - cos * padDir[1],
    joinDir[2] - cos * padDir[2],
  ]);
  const onward = normalize3([
    cos * joinDir[0] - padDir[0],
    cos * joinDir[1] - padDir[1],
    cos * joinDir[2] - padDir[2],
  ]);
  const alongKmS = dot3(joinVelKmS, onward);
  // Signed sweep: the long way round when the craft arrives moving back toward the pad.
  const sweep = alongKmS >= 0 ? theta : theta - 2 * Math.PI;

  const launchDays = isoToJulianDays(launch.iso);
  const spanS = (t0 - launchDays) * SECONDS_PER_DAY;
  const s = Math.min(Math.max((simDays - launchDays) / (t0 - launchDays), 0), 1);
  const h01 = 3 * s ** 2 - 2 * s ** 3;
  const h11 = s ** 3 - s ** 2;
  // Radius: up to parking height in the first minutes (a trail lying on the ground is hidden by
  // the planet), then a power ease-in whose end slope is the join's climb rate. A cubic would
  // have to dip thousands of km to reach that rate, as the climb comes from the last-minutes burn.
  const climbKm = joinR - groundKm;
  // Clamped so a join below parking height is never overshot; the rest is then zero.
  const parkKm = Math.max(0, Math.min(LAUNCH_CLIMB.parkKm, climbKm));
  const burnKm = climbKm - parkKm;
  const n = burnKm > 0 ? Math.max(1, (spanS * dot3(joinVelKmS, joinDir)) / burnKm) : 1;
  const riseS = Math.min(LAUNCH_CLIMB.riseS, spanS);
  const r = groundKm + parkKm * smoothstep(0, riseS, s * spanS) + burnKm * s ** n;
  // Angle swept so far; its end slope is the join's along-arc speed over the arc's radius.
  const phi = h01 * sweep + (h11 * spanS * alongKmS) / joinR;
  const a = Math.cos(phi);
  const b = Math.sin(phi);

  const earth = positionAt('earth', simDays);
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = earth[i]! + r * (a * padDir[i]! + b * perp[i]!) * k;
  return out;
}
