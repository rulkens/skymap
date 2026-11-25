import { describe, expect, it } from 'vitest';
import type { SampledBody } from '../../../src/@types/scene/SampledBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { LAUNCH_CLIMB } from '../../../src/data/orbit/launchClimb';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { sampledCraftPositionMpc } from '../../../src/utils/orbit/sampledCraftPositionMpc';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

const LAUNCH_ISO = '1977-09-05T12:56:00Z';
const LAUNCH = unixMsToJulianDays(Date.parse(LAUNCH_ISO));
const SECOND = 1 / 86_400;
const GROUND_KM = SCENE_EARTH.surface.datumRadiusM * 1e-3;
const EARTH_KM: Vec3 = [1.5e8, 0, 0];
const K = SCALE_UNITS.KM_TO_MPC;

// Sun at the origin and Earth at rest: the climb is then the only motion.
const positionAt = (id: string): Vec3 =>
  id === 'earth' ? [EARTH_KM[0] * K, EARTH_KM[1] * K, EARTH_KM[2] * K] : [0, 0, 0];

const body: SampledBody = {
  id: asSceneBodyId('voyager1'),
  launch: { iso: LAUNCH_ISO, pad: { latDeg: 28.5, lonDeg: -80.5 } },
};

/** A track whose first sample is `altKm` above the ground, `spanS` after launch, rising at `rateKmS`. */
const trackJoining = (altKm: number, spanS: number, rateKmS: number): SampledTrack => {
  const t0 = LAUNCH + spanS * SECOND;
  const y = GROUND_KM + altKm;
  return {
    id: 'voyager1',
    tDays: Float64Array.of(t0, t0 + 1),
    posKm: Float64Array.of(EARTH_KM[0], y, 0, EARTH_KM[0], y + rateKmS * 86_400, 0),
    velKmS: Float32Array.of(0, rateKmS, 0, 0, rateKmS, 0),
  };
};

const altKmAt = (track: SampledTrack, sinceLaunchS: number): number => {
  const p = sampledCraftPositionMpc(body, track, LAUNCH + sinceLaunchS * SECOND, positionAt);
  return (
    Math.hypot(p[0] / K - EARTH_KM[0], p[1] / K - EARTH_KM[1], p[2] / K - EARTH_KM[2]) - GROUND_KM
  );
};

// The Voyagers' join: about 1060 km up, 63 minutes after launch, climbing fast.
const SPAN_S = 63 * 60;
const voyagerLike = trackJoining(1060, SPAN_S, 6.7);

describe('sampledCraftPositionMpc, the climb before the first sample', () => {
  it('is at parking height ten minutes after launch, not still on the ground', () => {
    expect(Math.abs(altKmAt(voyagerLike, 600) - LAUNCH_CLIMB.parkKm)).toBeLessThan(1);
    expect(Math.abs(altKmAt(voyagerLike, 1800) - LAUNCH_CLIMB.parkKm)).toBeLessThan(1);
  });

  it('starts on the pad and reaches the join at the track’s own climb rate', () => {
    expect(Math.abs(altKmAt(voyagerLike, 0))).toBeLessThan(1e-3);
    expect(Math.abs(altKmAt(voyagerLike, SPAN_S - 1e-3) - 1060)).toBeLessThan(0.1);
    const rateKmS = altKmAt(voyagerLike, SPAN_S - 1) - altKmAt(voyagerLike, SPAN_S - 2);
    expect(Math.abs(rateKmS - 6.7)).toBeLessThan(0.1);
  });

  it.each([
    ['a join below parking height', trackJoining(100, SPAN_S, 0.05)],
    ['a join sooner than the rise takes', trackJoining(1060, 300, 6.7)],
  ])('%s never overshoots or falls back', (_name, track) => {
    const spanS = (track.tDays[0]! - LAUNCH) / SECOND;
    const joinAltKm = Math.hypot(track.posKm[1]!, track.posKm[2]!) - GROUND_KM;
    let last = altKmAt(track, 0);
    for (let i = 1; i <= 64; i++) {
      const alt = altKmAt(track, (spanS * i) / 64);
      expect(alt).toBeGreaterThanOrEqual(last - 1e-6);
      expect(alt).toBeLessThanOrEqual(joinAltKm + 1e-6);
      last = alt;
    }
    expect(Math.abs(last - joinAltKm)).toBeLessThan(1e-3);
  });
});

describe('sampledCraftPositionMpc, a body with no launch', () => {
  it('holds a body with no launch on its first sample before the track starts', () => {
    const p = sampledCraftPositionMpc({ id: body.id }, voyagerLike, LAUNCH, positionAt);
    expect(p).toEqual([voyagerLike.posKm[0]! * K, voyagerLike.posKm[1]! * K, 0]);
  });
});
