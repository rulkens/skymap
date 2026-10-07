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
import { DOCS_SETTING_SIZES } from '../../../packages/website/src/data/docsSettingSizes';
import { fact } from '../../../packages/website/src/data/fact';
import { HORIZON_RADIUS_GPC } from '../../../src/data/rendering/horizonRadiusGpc';
import { C_KM_S, H0_KM_S_MPC, PC_TO_LY } from '../../../src/utils/math/constants';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';
import { statedFigures } from './statedFigures';

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
  it('the page states the constants the app uses', () => {
    const [h0, omegaM] = statedFigures(
      'sci-galaxy-distance',
      /Hubble constant of (\d+) km\/s per megaparsec and a matter density of (\d+(?:\.\d+)?)/,
    );
    expect(h0).toBe(H0_KM_S_MPC);
    expect(omegaM).toBe(OMEGA_M);
    const [gpc, gly] = statedFigures(
      'sci-horizon-shell',
      /drawn at (\d+(?:\.\d+)?) gigaparsecs \((\d+(?:\.\d+)?) thousand million light-years\)/,
    );
    expect(gpc).toBe(HORIZON_RADIUS_GPC);
    expect(gpc! * PC_TO_LY).toBeCloseTo(gly!, 1);
  });

  it('the horizon for the Hubble constant we use, and how far out the sphere is drawn', () => {
    const [shell, fits, ours, model, percent] = statedFigures(
      'sim-horizon-h0',
      /sphere at (\d+(?:\.\d+)?) gigaparsecs fits a Hubble constant near (\d+)\. With the (\d+) we use .* gives about (\d+(?:\.\d+)?) gigaparsecs\. The sphere is drawn about (\d+) per cent/,
    );
    expect([shell, ours]).toEqual([HORIZON_RADIUS_GPC, H0_KM_S_MPC]);
    const horizon = horizonMpc(H0_KM_S_MPC) / 1000;
    expect(horizon).toBeCloseTo(model!, 1);
    expect(Math.round((shell! / horizon - 1) * 100)).toBe(percent);
    expect(horizonMpc(fits!) / 1000).toBeCloseTo(shell!, 0);
  });

  it('redshift distances and the share of the way to the sphere', () => {
    const [quasarZ, quasarGpc, percent, sdssZ, sdssGpc] = statedFigures(
      'sci-deepest',
      /redshift near (\d+)\. Our model places that about (\d+(?:\.\d+)?) gigaparsecs away, (\d+) per cent of the way to the sphere\. The SDSS galaxies stop at a redshift of (\d+(?:\.\d+)?), about (\d+(?:\.\d+)?) gigaparsecs/,
    );
    const deepest = redshiftToDistanceMpc(quasarZ!) / 1000;
    expect(deepest).toBeCloseTo(quasarGpc!, 1);
    expect(Math.round((deepest / HORIZON_RADIUS_GPC) * 100)).toBe(percent);
    expect(redshiftToDistanceMpc(sdssZ!) / 1000).toBeCloseTo(sdssGpc!, 1);
  });

  it('errors, velocities and other constants as megaparsecs', () => {
    const [cutMpc, cutMly] = statedFigures(
      'sci-galaxy-distance',
      /Beyond (\d+) megaparsecs \((\d+) million light-years\)/,
    );
    expect(Math.round(cutMpc! * PC_TO_LY)).toBe(cutMly);
    const [placed, nearer, high, farther, low] = statedFigures(
      'sci-h0-range',
      /place at (\d+) megaparsecs would sit at about (\d+) with a constant of (\d+(?:\.\d+)?), or (\d+) with (\d+(?:\.\d+)?)/,
    );
    expect(Math.round((placed! * H0_KM_S_MPC) / high!)).toBe(nearer);
    expect(Math.round((placed! * H0_KM_S_MPC) / low!)).toBe(farther);
    const [kmS, share, atMpc, allAtMpc] = statedFigures(
      'sci-local-volume',
      /: (\d+) km\/s is (\d+) per cent of the expansion at (\d+) megaparsecs and all of it at about (\d+)/,
    );
    expect(Math.round((kmS! / (atMpc! * H0_KM_S_MPC)) * 100)).toBe(share);
    expect(Math.round(kmS! / H0_KM_S_MPC)).toBe(allAtMpc);
    const [streakKmS, streakMpc] = statedFigures(
      'sim-redshift-space',
      /(\d+) km\/s shifts it by about (\d+) megaparsecs/,
    );
    expect(Math.round(streakKmS! / H0_KM_S_MPC)).toBe(streakMpc);
    const [photometric, usableMillions, percent, error, z, errorMpc] = statedFigures(
      'sci-photometric-share',
      /about ([\d,]+) of its (\d+(?:\.\d+)?) million usable rows, roughly (\d+) per cent, .* error near (\d+(?:\.\d+)?)\. At a redshift of (\d+(?:\.\d+)?) that error is about (\d+) megaparsecs/,
    );
    expect(Math.round((photometric! / (usableMillions! * 1e6)) * 100)).toBe(percent);
    expect(redshiftToDistanceMpc(z! + error!) - redshiftToDistanceMpc(z!)).toBeCloseTo(
      errorMpc!,
      -1,
    );
    const [cosmicflows, outside, step] = statedFigures(
      'sim-scale-step',
      /Hubble constant of (\d+(?:\.\d+)?) km\/s per megaparsec\. Outside we use (\d+)\. .* about (\d+) per cent/,
    );
    expect(outside).toBe(H0_KM_S_MPC);
    expect(Math.round((cosmicflows! / outside! - 1) * 100)).toBe(step);
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
      expect(Boolean(row.ask), `${row.id} quotes a text only with its page`).toBe(
        Boolean(row.askHref),
      );
    }
  });

  // The count of stars drawn is typed in four places: the table, two sentences of the Science page and All settings.
  it('gives Gaia the count of stars its sentences and the settings table give', () => {
    const { drawn } = DATA_SOURCES.find((row) => row.id === 'gaia')!;
    expect(fact('sci-star-observables').text).toContain(`${drawn} stars`);
    expect(fact('sim-star-coverage').text).toContain(`${drawn} at the largest`);
    expect(DOCS_SETTING_SIZES.find((size) => size.what === 'Gaia stars')!.large).toBe(drawn);
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
