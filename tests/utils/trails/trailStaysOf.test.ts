import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { TrailCentre } from '../../../src/@types/rendering/sampledTrailRenderer/TrailCentre';
import { trailStaysOf } from '../../../src/utils/trails/trailStaysOf';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { hermiteTrackAt } from '../../../src/utils/orbit/hermiteTrackAt';

// A craft flying along +x at 1e6 km per day, sampled daily from day 0 to day 40.
const KM_PER_DAY = 1e6;
const KM_PER_S = KM_PER_DAY / 86400;
const T_FIRST = 2460000;
const N = 41;

function line(): SampledTrack {
  const tDays = new Float64Array(N);
  const posKm = new Float64Array(3 * N);
  const velKmS = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    tDays[i] = T_FIRST + i;
    posKm[3 * i] = i * KM_PER_DAY;
    velKmS[3 * i] = KM_PER_S;
  }
  return { id: 'x', tDays, posKm, velKmS };
}

// Fixed bodies at the given km positions; the Sun is at the origin.
function stubAt(bodiesKm: Record<string, Vec3>): (id: string, t: number) => Vec3 {
  return (id) => {
    const p = bodiesKm[id] ?? [0, 0, 0];
    return [
      p[0] * SCALE_UNITS.KM_TO_MPC,
      p[1] * SCALE_UNITS.KM_TO_MPC,
      p[2] * SCALE_UNITS.KM_TO_MPC,
    ];
  };
}

const centre = (id: string, reachKm: number): TrailCentre => ({ id: asSceneBodyId(id), reachKm });

describe('trailStaysOf', () => {
  it('gives one stay whose ends sit on the reach', () => {
    const track = line();
    const c = centre('a', 8e6);
    const at = stubAt({ a: [20e6, 5e6, 0] });
    const stays = trailStaysOf(track, [c], at);
    expect(stays).toHaveLength(1);
    for (const t of [stays[0]!.t0Days, stays[0]!.t1Days]) {
      const p = hermiteTrackAt(track, t);
      const dist = Math.hypot(p[0] - 20e6, p[1] - 5e6, p[2]);
      expect(Math.abs(dist - c.reachKm) / c.reachKm).toBeLessThan(0.001);
    }
  });

  it('gives no stay for a body farther from the path than its reach', () => {
    const stays = trailStaysOf(line(), [centre('a', 3e6)], stubAt({ a: [20e6, 5e6, 0] }));
    expect(stays).toEqual([]);
  });

  it('gives two stays in time order for two bodies along the path', () => {
    const centres = [centre('late', 4e6), centre('early', 4e6)];
    const at = stubAt({ late: [30e6, 0, 0], early: [10e6, 0, 0] });
    const stays = trailStaysOf(line(), centres, at);
    expect(stays.map((s) => s.centreId)).toEqual(['early', 'late']);
    expect(stays[0]!.t1Days).toBeLessThan(stays[1]!.t0Days);
  });

  it('opens a stay at the first sample when the track starts inside the reach', () => {
    const stays = trailStaysOf(line(), [centre('a', 5e6)], stubAt({ a: [2e6, 0, 0] }));
    expect(stays).toHaveLength(1);
    expect(stays[0]!.t0Days).toBe(T_FIRST);
  });
});
