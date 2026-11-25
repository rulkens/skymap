/**
 * withLaunchAscent — a sampled track with the climb from the launch pad put in front of it, so a
 * trail cut from it starts on the pad. The climb is `sampledCraftPositionMpc`'s, sampled here in
 * the track's own terms (Sun-centred km, km/s), which keeps the trail under the craft.
 */

import type { SampledBody } from '../../@types/scene/SampledBody';
import type { SampledTrack } from '../../@types/scene/SampledTrack';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { SECONDS_PER_DAY } from '../../data/time/secondsPerDay';
import { unixMsToJulianDays } from '../time/unixMsToJulianDays';
import { sampledCraftPositionMpc } from './sampledCraftPositionMpc';

const ASCENT_SAMPLES = 64;

export function withLaunchAscent(
  body: SampledBody,
  track: SampledTrack,
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): SampledTrack {
  if (!body.launch) return track;
  const t0 = track.tDays[0]!;
  const launchDays = unixMsToJulianDays(Date.parse(body.launch.iso));
  if (!(launchDays < t0)) return track;

  const sunKmAt = (t: number): Vec3 => {
    const craft = sampledCraftPositionMpc(body, track, t, positionAt);
    const sun = positionAt('sun', t);
    const k = SCALE_UNITS.KM_TO_MPC;
    return [(craft[0] - sun[0]) / k, (craft[1] - sun[1]) / k, (craft[2] - sun[2]) / k];
  };

  const n = ASCENT_SAMPLES;
  const stepDays = (t0 - launchDays) / n;
  // Velocity by central difference, one-sided at the launch instant. Every probe stays before
  // `t0`, inside the climb.
  const probeDays = stepDays / 100;
  const tDays = new Float64Array(n + track.tDays.length);
  const posKm = new Float64Array(3 * tDays.length);
  const velKmS = new Float32Array(3 * tDays.length);
  for (let i = 0; i < n; i++) {
    const t = launchDays + i * stepDays;
    const tA = Math.max(launchDays, t - probeDays);
    const tB = t + probeDays;
    const a = sunKmAt(tA);
    const b = sunKmAt(tB);
    tDays[i] = t;
    posKm.set(sunKmAt(t), 3 * i);
    for (let k = 0; k < 3; k++) {
      velKmS[3 * i + k] = (b[k]! - a[k]!) / ((tB - tA) * SECONDS_PER_DAY);
    }
  }
  tDays.set(track.tDays, n);
  posKm.set(track.posKm, 3 * n);
  velKmS.set(track.velKmS, 3 * n);
  return { id: track.id, tDays, posKm, velKmS };
}
