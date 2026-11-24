import { describe, expect, it } from 'vitest';
import type { SampledBody } from '../../../src/@types/missions/SampledBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { withLaunchAscent } from '../../../src/utils/orbit/withLaunchAscent';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

const LAUNCH_ISO = '1977-09-05T12:56:00Z';
const LAUNCH = unixMsToJulianDays(Date.parse(LAUNCH_ISO));
const T0 = LAUNCH + 1 / 24;
const EARTH_KM: Vec3 = [1.5e8, 0, 0];
const K = SCALE_UNITS.KM_TO_MPC;

// Sun at the origin and Earth at rest: the climb is then the only motion.
const positionAt = (id: string): Vec3 =>
  id === 'earth' ? [EARTH_KM[0] * K, EARTH_KM[1] * K, EARTH_KM[2] * K] : [0, 0, 0];

const body: SampledBody = {
  id: asSceneBodyId('voyager1'),
  trailColor: [1, 1, 1],
  launchIso: LAUNCH_ISO,
  launchPad: { latDeg: 28.5, lonDeg: -80.5 },
};

// Two samples, 20 000 km from Earth and climbing at 10 km/s.
const track: SampledTrack = {
  id: 'voyager1',
  tDays: Float64Array.of(T0, T0 + 1),
  posKm: Float64Array.of(EARTH_KM[0], 20_000, 0, EARTH_KM[0], 884_000, 0),
  velKmS: Float32Array.of(0, 10, 0, 0, 10, 0),
};

describe('withLaunchAscent', () => {
  it('starts on the pad at launch and keeps the loaded samples after the climb', () => {
    const out = withLaunchAscent(body, track, positionAt);
    const added = out.tDays.length - track.tDays.length;
    expect(added).toBeGreaterThan(0);
    expect(out.tDays[0]).toBe(LAUNCH);
    const fromEarthKm = Math.hypot(
      out.posKm[0]! - EARTH_KM[0],
      out.posKm[1]! - EARTH_KM[1],
      out.posKm[2]! - EARTH_KM[2],
    );
    expect(fromEarthKm).toBeCloseTo(SCENE_EARTH.surface.datumRadiusM * 1e-3, 3);
    expect(Array.from(out.tDays.subarray(added))).toEqual(Array.from(track.tDays));
    expect(Array.from(out.posKm.subarray(3 * added))).toEqual(Array.from(track.posKm));
    for (let i = 1; i < out.tDays.length; i++)
      expect(out.tDays[i]!).toBeGreaterThan(out.tDays[i - 1]!);
  });

  it('leaves a track that already starts at or before launch alone', () => {
    const early = { ...track, tDays: Float64Array.of(LAUNCH - 1, LAUNCH + 1) };
    expect(withLaunchAscent(body, early, positionAt)).toBe(early);
  });
});
