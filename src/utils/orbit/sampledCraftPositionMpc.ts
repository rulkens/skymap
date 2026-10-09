/**
 * sampledCraftPositionMpc — a sampled craft's world position at `simDays`. On the track from its
 * first sample; before it, it rises from the launch pad (turning with Earth) to that sample, which
 * an hour later sits ~260° east round Earth: a straight blend would tunnel through the planet, so
 * the Earth-relative radius and great-circle angle are eased separately, each ending on the
 * sample's own radial and along-arc velocity. Before launch it waits on the pad. `positionAt` is injected
 * (`bodyPositionMpcAt`) to place Earth and the Sun at other instants without an import cycle.
 */

import type { SampledBody } from '../../@types/missions/SampledBody';
import type { SampledTrack } from '../../@types/scene/SampledTrack';
import type { Vec3 } from '../../@types/math/Vec3';
import { orientationForBody } from '../../data/bodies/orientationForBody';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { surfacePointBodyFixed } from '../geo/surfacePointBodyFixed';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { unixMsToJulianDays } from '../time/unixMsToJulianDays';
import { hermiteTrackAt } from './hermiteTrackAt';

const SECONDS_PER_DAY = 86_400;
const DIFF_HALF_STEP_S = 60;
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
  if (simDays >= t0) {
    const km = hermiteTrackAt(track, simDays);
    const sun = positionAt('sun', simDays);
    return [sun[0] + km[0] * k, sun[1] + km[1] * k, sun[2] + km[2] * k];
  }

  // The join, Earth-relative (km, km/s): the track is Sun-centred, Earth's velocity a central
  // difference.
  const sun0 = positionAt('sun', t0);
  const earth0 = positionAt('earth', t0);
  const halfDays = DIFF_HALF_STEP_S / SECONDS_PER_DAY;
  const earthBefore = positionAt('earth', t0 - halfDays);
  const earthAfter = positionAt('earth', t0 + halfDays);
  const joinKm: Vec3 = [0, 0, 0];
  const joinVelKmS: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    joinKm[i] = track.posKm[i]! + (sun0[i]! - earth0[i]!) / k;
    const earthVelKmS = (earthAfter[i]! - earthBefore[i]!) / k / (2 * DIFF_HALF_STEP_S);
    joinVelKmS[i] = track.velKmS[i]! - earthVelKmS;
  }

  const groundKm = SCENE_EARTH.surface.datumRadiusM * 1e-3;
  const { latDeg, lonDeg } = body.launchPad;
  const padDir = rotateVec3ByTightMat3(
    surfacePointBodyFixed(latDeg, lonDeg, 1),
    orientationForBody('earth', simDays, NO_POSITIONS),
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

  const launchDays = unixMsToJulianDays(Date.parse(body.launchIso));
  const spanS = (t0 - launchDays) * SECONDS_PER_DAY;
  const s = Math.min(Math.max((simDays - launchDays) / (t0 - launchDays), 0), 1);
  const h01 = 3 * s ** 2 - 2 * s ** 3;
  const h11 = s ** 3 - s ** 2;
  // Radius: a power ease-in whose end slope is the join's climb rate. A cubic would have to dip
  // thousands of km to reach that rate, as the climb comes from the last-minutes burn.
  const climbKm = joinR - groundKm;
  const n = Math.max(1, (spanS * dot3(joinVelKmS, joinDir)) / climbKm);
  const r = groundKm + climbKm * s ** n;
  // Angle swept so far; its end slope is the join's along-arc speed over the arc's radius.
  const phi = h01 * sweep + (h11 * spanS * alongKmS) / joinR;
  const a = Math.cos(phi);
  const b = Math.sin(phi);

  const earth = positionAt('earth', simDays);
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = earth[i]! + r * (a * padDir[i]! + b * perp[i]!) * k;
  return out;
}
