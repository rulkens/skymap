import { describe, expect, it } from 'vitest';

import type { VasilievStar } from '../../../../tools/streams/@types/VasilievStar';
import {
  SGR_OLDEST_STRIP_GYR,
  SGR_PARTICLE_BUDGET,
} from '../../../../tools/streams/data/streamsBuild.constants';
import { sagittariusParticles } from '../../../../tools/streams/utils/sagittariusParticles';
import { galToEq } from '../../../../tools/utils/math/galToEq';

function star(i: number, tStripGyr = 0): VasilievStar {
  return {
    x: 17,
    y: 2,
    z: -6,
    vx: 230,
    vy: -25,
    vz: 215,
    ra: (i * 0.37) % 360,
    dec: -30 + (i % 60),
    distanceKpc: 20 + (i % 30),
    tStripGyr,
  };
}

const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;

describe('sagittariusParticles', () => {
  it('subsamples to the budget, deterministically for one seed', () => {
    const rows = Array.from({ length: SGR_PARTICLE_BUDGET + 10_000 }, (_, i) => star(i));
    const a = sagittariusParticles(rows, 1n);
    expect(a.luminosity.length).toBe(SGR_PARTICLE_BUDGET);
    expect(sagittariusParticles(rows, 1n)).toEqual(a);
    expect(Array.from(sagittariusParticles(rows, 2n).positionsMpc)).not.toEqual(
      Array.from(a.positionsMpc),
    );
  });

  it('the tangent is the rotated galactocentric velocity', () => {
    const row = { ...star(0), vx: 0, vy: 0, vz: 200 };
    const [tx, ty, tz] = galToEq([0, 0, 1]);
    const { tangents } = sagittariusParticles([row], 1n);
    expect(tangents[0]).toBeCloseTo(tx, 6);
    expect(tangents[1]).toBeCloseTo(ty, 6);
    expect(tangents[2]).toBeCloseTo(tz, 6);
  });

  it('bound particles lean orange and the oldest lean blue', () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      star(i, i < 100 ? 0 : -SGR_OLDEST_STRIP_GYR),
    );
    const { colourT } = sagittariusParticles(rows, 1n);
    expect(Math.min(...colourT.subarray(0, 100))).toBeGreaterThan(
      Math.max(...colourT.subarray(100)),
    );
  });

  it('luminosity carries no stripping-time trend', () => {
    const n = 20_000;
    const rows = Array.from({ length: n }, (_, i) => star(i, (-SGR_OLDEST_STRIP_GYR * i) / n));
    const { luminosity } = sagittariusParticles(rows, 1n);
    const young = mean(luminosity.subarray(0, n / 2));
    const old = mean(luminosity.subarray(n / 2));
    expect(Math.abs(young - old) / young).toBeLessThan(0.05);
  });
});
