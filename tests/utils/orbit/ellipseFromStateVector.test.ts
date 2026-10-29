import { describe, expect, it } from 'vitest';
import { ellipseFromStateVector } from '../../../src/utils/orbit/ellipseFromStateVector';
import { EARTH_GM_KM3_S2 as MU } from '../../../src/data/earthGmKm3S2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const pointAt = (
  o: NonNullable<ReturnType<typeof ellipseFromStateVector>>,
  eccentricAnomaly: number,
): Vec3 =>
  [0, 1, 2].map(
    (i) =>
      o.centerOffset[i]! +
      o.semiMajor[i]! * Math.cos(eccentricAnomaly) +
      o.semiMinor[i]! * Math.sin(eccentricAnomaly),
  ) as Vec3;

// Solve Kepler's equation by Newton iteration, to put the satellite back on its own ellipse.
const eccentricFromMean = (m: number, e: number): number => {
  let big = m;
  for (let i = 0; i < 50; i++) big -= (big - e * Math.sin(big) - m) / (1 - e * Math.cos(big));
  return big;
};

describe('ellipseFromStateVector', () => {
  it('puts a Molniya-like state back on its ellipse at the returned mean anomaly', () => {
    const r: Vec3 = [-9000, 14000, 5000];
    // Vis-viva speed for a = 26 600 km along a fixed direction; the radius makes it highly eccentric.
    const speed = Math.sqrt(MU * (2 / Math.hypot(...r) - 1 / 26_600));
    const dir = [-0.6, -0.5, 0.1].map((c) => c / Math.hypot(-0.6, -0.5, 0.1));
    const v: Vec3 = [dir[0]! * speed, dir[1]! * speed, dir[2]! * speed];
    const o = ellipseFromStateVector(r, v, MU)!;
    expect(Math.hypot(...o.semiMajor)).toBeCloseTo(26_600, 0);
    expect(o.eccentricity).toBeGreaterThan(0.3);
    const back = pointAt(o, eccentricFromMean(o.meanAnomalyRad, o.eccentricity));
    for (let i = 0; i < 3; i++) expect(back[i]!).toBeCloseTo(r[i]!, 3);
  });

  it('runs prograde: a quarter turn of E later is further along the velocity', () => {
    const r: Vec3 = [7000, 0, 0];
    const v: Vec3 = [0, 7.5, 0.5];
    const o = ellipseFromStateVector(r, v, MU)!;
    const e0 = eccentricFromMean(o.meanAnomalyRad, o.eccentricity);
    const ahead = pointAt(o, e0 + 0.01);
    expect(ahead[1]! * v[1]! + ahead[2]! * v[2]!).toBeGreaterThan(0);
  });

  it('keeps a circular orbit finite and at E = 0 under the satellite', () => {
    const r: Vec3 = [6778, 0, 0];
    const v: Vec3 = [0, Math.sqrt(MU / 6778), 0];
    const o = ellipseFromStateVector(r, v, MU)!;
    expect(o.eccentricity).toBeLessThan(1e-9);
    expect(o.meanAnomalyRad).toBeCloseTo(0, 6);
    expect(pointAt(o, 0)[0]!).toBeCloseTo(6778, 3);
  });

  it('refuses an escape trajectory and a radial one', () => {
    expect(ellipseFromStateVector([7000, 0, 0], [0, 12, 0], MU)).toBeNull();
    expect(ellipseFromStateVector([7000, 0, 0], [3, 0, 0], MU)).toBeNull();
  });
});
