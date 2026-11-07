import { describe, expect, it } from 'vitest';

import type { VasilievStar } from '../../../../tools/streams/@types/VasilievStar';
import {
  SGR_BOUND_SHARE,
  SGR_FEH_OLD_STRIP_GYR,
  SGR_PARTICLE_BUDGET,
} from '../../../../tools/streams/data/streamsBuild.constants';
import { sagittariusParticles } from '../../../../tools/streams/utils/sagittariusParticles';
import { sagittariusMeta } from '../../../../tools/streams/utils/sagittariusMeta';
import { raDecDistToEqCart } from '../../../../src/utils/math/raDecDistToEqCart';
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
const BOUND_CAP = Math.floor(SGR_BOUND_SHARE * SGR_PARTICLE_BUDGET);
// Bound rows sit at 20 kpc, stripped ones at 60, so a particle's distance names its class.
const sgrRows = (bound: number, stripped: number): VasilievStar[] => [
  ...Array.from({ length: bound }, (_, i) => ({ ...star(i), distanceKpc: 20 })),
  ...Array.from({ length: stripped }, (_, i) => ({ ...star(i, -1), distanceKpc: 60 })),
];
function boundCount(positionsMpc: Float32Array): number {
  let count = 0;
  for (let i = 0; i < positionsMpc.length; i += 3) {
    if (Math.hypot(positionsMpc[i]!, positionsMpc[i + 1]!, positionsMpc[i + 2]!) < 0.04) count++;
  }
  return count;
}

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

  it('caps the bound remnant and spends the rest of the budget on debris', () => {
    const { positionsMpc } = sagittariusParticles(sgrRows(40_000, 70_000), 1n);
    expect(positionsMpc.length / 3).toBe(SGR_PARTICLE_BUDGET);
    expect(boundCount(positionsMpc)).toBe(BOUND_CAP);
  });

  it('takes every bound row when there are fewer than the cap', () => {
    const { positionsMpc } = sagittariusParticles(sgrRows(100, 70_000), 1n);
    expect(positionsMpc.length / 3).toBe(SGR_PARTICLE_BUDGET);
    expect(boundCount(positionsMpc)).toBe(100);
  });

  it('bound rows fill what the debris cannot, so the budget is never underspent', () => {
    const { positionsMpc } = sagittariusParticles(sgrRows(40_000, 30_000), 1n);
    expect(positionsMpc.length / 3).toBe(SGR_PARTICLE_BUDGET);
    expect(boundCount(positionsMpc)).toBe(SGR_PARTICLE_BUDGET - 30_000);
  });

  it("the meta's anchor and extent read the full snapshot, not the capped pick", () => {
    const rows = sgrRows(40_000, 70_000).map((s, i) => ({ ...s, ra: i % 2 ? 10 : 200 }));
    const meta = sagittariusMeta(rows, sagittariusParticles(rows, 1n), null);
    const bound = rows.filter((s) => s.tStripGyr === 0);
    const anchor = [0, 1, 2].map(
      (c) =>
        bound.reduce(
          (sum, s) =>
            sum +
            raDecDistToEqCart({ raHours: s.ra / 15, decDeg: s.dec, distMpc: s.distanceKpc / 1e3 })[
              c
            ]!,
          0,
        ) / bound.length,
    );
    meta.anchorMpc.forEach((v, c) => expect(v).toBeCloseTo(anchor[c]!, 9));
    expect(sagittariusMeta(rows, sagittariusParticles(rows, 2n), null).lengthKpc).toBe(
      meta.lengthKpc,
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

  it('the metal-rich bound core is redder on average than the oldest debris', () => {
    const rows = Array.from({ length: 4000 }, (_, i) =>
      star(i, i < 2000 ? 0 : -SGR_FEH_OLD_STRIP_GYR),
    );
    const { colourT } = sagittariusParticles(rows, 1n);
    expect(mean(colourT.subarray(0, 2000))).toBeGreaterThan(mean(colourT.subarray(2000)) + 0.03);
  });

  it('luminosity carries no stripping-time trend', () => {
    const n = 20_000;
    const rows = Array.from({ length: n }, (_, i) => star(i, (-SGR_FEH_OLD_STRIP_GYR * i) / n));
    const { luminosity } = sagittariusParticles(rows, 1n);
    const young = mean(luminosity.subarray(0, n / 2));
    const old = mean(luminosity.subarray(n / 2));
    expect(Math.abs(young - old) / young).toBeLessThan(0.05);
  });
});
