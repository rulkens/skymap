/**
 * The Science page's worked numbers, redone from their inputs with the app's
 * own distance function, and the citation held against CITATION.cff. A changed
 * H0, horizon radius or release would otherwise leave the page quoting the
 * old figure.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CITATION } from '../../../packages/website/src/data/citation';
import { DATA_SOURCES } from '../../../packages/website/src/data/dataSources';
import { HORIZON_RADIUS_GPC } from '../../../src/data/rendering/horizonRadiusGpc';
import { C_KM_S, H0_KM_S_MPC, PC_TO_LY } from '../../../src/utils/math/constants';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';

const OMEGA_M = 0.315;
// Photons and three massless neutrino species: Omega_r h^2 = 4.18e-5.
const OMEGA_R_H2 = 4.18e-5;

/** Particle horizon in Mpc for flat Lambda-CDM with radiation, integrated in x = sqrt(a). */
function horizonMpc(h0: number): number {
  const omegaR = OMEGA_R_H2 / (h0 / 100) ** 2;
  const omegaL = 1 - OMEGA_M - omegaR;
  const n = 200_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n;
    const a = x * x;
    sum += (2 * x) / (a * a * Math.sqrt(omegaR / a ** 4 + OMEGA_M / a ** 3 + omegaL)) / n;
  }
  return (C_KM_S / h0) * sum;
}

describe('science page numbers', () => {
  it('the app still uses the constants the page states', () => {
    expect(H0_KM_S_MPC).toBe(70);
    expect(HORIZON_RADIUS_GPC).toBe(14.3);
    expect(HORIZON_RADIUS_GPC * PC_TO_LY).toBeCloseTo(46.6, 1);
  });

  it('the horizon is about 13.6 Gpc with H0 = 70 and near 14.3 only with a constant near 67', () => {
    const at70 = horizonMpc(H0_KM_S_MPC) / 1000;
    expect(at70).toBeCloseTo(13.6, 1);
    expect(Math.round((HORIZON_RADIUS_GPC / at70 - 1) * 100)).toBe(5);
    expect(horizonMpc(67.4) / 1000).toBeGreaterThan(14.1);
  });

  it('redshift distances: 0.3 is about 1.2 Gpc, 7 about 8.5 Gpc and 59 percent of the way to the sphere', () => {
    expect(redshiftToDistanceMpc(0.3) / 1000).toBeCloseTo(1.2, 1);
    const deepest = redshiftToDistanceMpc(7) / 1000;
    expect(deepest).toBeCloseTo(8.5, 1);
    expect(Math.round((deepest / HORIZON_RADIUS_GPC) * 100)).toBe(59);
  });

  it('errors and velocities as megaparsecs', () => {
    expect(redshiftToDistanceMpc(0.115) - redshiftToDistanceMpc(0.1)).toBeCloseTo(60, -1);
    expect(Math.round(300 / H0_KM_S_MPC)).toBe(4);
    expect(Math.round((100 * H0_KM_S_MPC) / 73)).toBe(96);
    expect(Math.round((100 * H0_KM_S_MPC) / 67.4)).toBe(104);
    expect(Math.round((74.6 / H0_KM_S_MPC - 1) * 100)).toBe(7);
    expect(Math.round(30 * PC_TO_LY)).toBe(98);
    expect(Math.round((935 / 2100) * 100)).toBe(45);
  });
});

describe('data sources', () => {
  it('every row has a unique id and https links to its source and to our record', () => {
    const ids = DATA_SOURCES.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of DATA_SOURCES) {
      for (const url of [row.href, row.evidence, ...(row.askHref ? [row.askHref] : [])]) {
        expect(new URL(url).protocol, row.id).toBe('https:');
      }
      expect(Boolean(row.ask), `${row.id} quotes a text only with its page`).toBe(Boolean(row.askHref));
    }
  });
});

describe('citation', () => {
  it('matches CITATION.cff', () => {
    const cff = readFileSync(resolve(import.meta.dirname, '../../../CITATION.cff'), 'utf8');
    expect(cff).toContain(`title: '${CITATION.title}'`);
    expect(cff).toContain(`doi: ${CITATION.conceptDoi}`);
    expect(cff).toContain(`version: ${CITATION.version}`);
    expect(cff).toContain(`date-released: '${CITATION.released}'`);
  });
});
