/**
 * The crest lands on the DEM's rim, not on the gazetteer's radius, and a crater the
 * DEM does not show (flat ground) reports no confidence, so its weight is zero.
 */

import { describe, it, expect } from 'vitest';

import type { EquirectGrid } from '../../../../../tools/antique/moon/@types/EquirectGrid';
import { fitCraterRim } from '../../../../../tools/antique/moon/utils/fitCraterRim';

const R_KM = 1737.4;
const W = 2880;
const H = 1440;

/** A bowl 2 km deep inside a 1 km rim ridge at `rimRad` round (lat 20°, lon 30°). */
function craterDem(rimRad: number): EquirectGrid {
  const la = (20 * Math.PI) / 180;
  const lo = (30 * Math.PI) / 180;
  const c = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 2 * Math.PI - Math.PI;
      const d =
        Math.cos(lat) * Math.cos(lon) * c[0]! +
        Math.cos(lat) * Math.sin(lon) * c[1]! +
        Math.sin(lat) * c[2]!;
      const psi = Math.acos(Math.min(1, d));
      const ridge = 1000 * Math.exp(-(((psi - rimRad) / (0.12 * rimRad)) ** 2));
      data[y * W + x] = ridge - (psi < 0.8 * rimRad ? 2000 : 0);
    }
  }
  return { width: W, height: H, data };
}

describe('fitCraterRim', () => {
  it('finds the DEM crest 12% outside the listed radius', () => {
    const listedKm = 150;
    const rimRad = (1.12 * listedKm) / R_KM;
    const fit = fitCraterRim(craterDem(rimRad), 20, 30, 2 * listedKm, R_KM);
    expect(fit.rhoRad / rimRad).toBeCloseTo(1, 1);
    expect(fit.depthKm).toBeGreaterThan(2.5);
    expect(fit.confidence).toBeGreaterThan(0.9);
  });

  it('has no confidence on flat ground', () => {
    const flat = { width: W, height: H, data: new Float32Array(W * H) };
    expect(fitCraterRim(flat, 20, 30, 300, R_KM).confidence).toBe(0);
  });
});
