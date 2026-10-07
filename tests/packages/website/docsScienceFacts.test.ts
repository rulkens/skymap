/**
 * The worked numbers of the docs' two Science pages, redone with the app's own
 * functions, so a changed constant or rule leaves no page quoting the old
 * figure.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fact } from '../../../packages/website/src/data/fact';
import { C_KM_S, H0_KM_S_MPC, HUBBLE_TIME_GYR, PC_TO_LY } from '../../../src/utils/math/constants';
import { lookbackTimeGyr } from '../../../src/utils/math/lookbackTimeGyr';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';

const PAGE = readFileSync(
  resolve(__dirname, '../../../packages/website/src/content/docs/science.mdx'),
  'utf8',
);
const OMEGA_M = 0.315;

/** Light-travel time in the app's flat model, by the midpoint rule. */
function lookbackGyr(z: number): number {
  const n = 20_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const at = ((i + 0.5) / n) * z;
    sum += 1 / ((1 + at) * Math.sqrt(OMEGA_M * (1 + at) ** 3 + 1 - OMEGA_M));
  }
  return (sum * z * HUBBLE_TIME_GYR) / n;
}

describe('docs science numbers', () => {
  it('the table of distances is what the distance function gives', () => {
    const rows = [
      ...PAGE.matchAll(
        /\['([\d.]+)', '([\d,]+)', '([\d.]+) (million|billion)(?: \(thousand million\))?'\]/g,
      ),
    ];
    expect(rows.length).toBe(6);
    for (const [, z, mpc, ly, unit] of rows) {
      const d = redshiftToDistanceMpc(Number(z));
      expect(Math.round(d)).toBe(Number(mpc!.replace(/,/g, '')));
      const lightYears = d * 1e6 * PC_TO_LY;
      expect(lightYears / (unit === 'million' ? 1e6 : 1e9)).toBeCloseTo(
        Number(ly),
        Number(ly) < 100 ? 1 : -1,
      );
    }
  });

  it('the straight-line rule is off by what the page says', () => {
    const text = fact('method-comoving').text;
    expect(text).toContain(`${Math.round(C_KM_S / H0_KM_S_MPC).toLocaleString('en')} megaparsecs`);
    const off = (z: number) => ((C_KM_S * z) / H0_KM_S_MPC / redshiftToDistanceMpc(z) - 1) * 100;
    expect(off(0.1)).toBeCloseTo(2.5, 1);
    expect(Math.round(off(1))).toBe(31);
  });

  it('the light-travel rule falls short by what the page says', () => {
    const short = (z: number) => Math.round((1 - lookbackTimeGyr(z) / lookbackGyr(z)) * 100);
    expect([short(0.1), short(0.3), short(1)]).toEqual([2, 5, 9]);
    expect(fact('depart-light-travel').text).toContain(
      '2 per cent short at a redshift of 0.1, 5 per cent at 0.3 and 9 per cent at 1',
    );
  });

  it('the fade and the luminosity figures follow from their powers', () => {
    expect(Math.round(10 ** 0.7)).toBe(5);
    expect(Math.round(100 / 10 ** 0.7)).toBe(20);
    expect((5 * Math.log10(1.1)).toFixed(1)).toBe('0.2');
    expect((5 * Math.log10(1.3)).toFixed(1)).toBe('0.6');
  });
});
