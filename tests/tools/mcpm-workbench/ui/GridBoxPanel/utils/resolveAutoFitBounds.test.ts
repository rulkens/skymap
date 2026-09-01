/**
 * resolveAutoFitBounds — at 100% must reproduce today's plain-`catalogBoundsMpc`
 * Auto fit path bit-for-bit (not merely "close", since `buildFitProfile` sorts
 * by a different key and only coincidentally agrees at the full set); below
 * 100% it defers to `fitProfileBounds`, already covered by its own suite.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import type { CatalogPoints } from '../../../../../../tools/mcpm-workbench/@types/CatalogPoints';
import { buildFitProfile } from '../../../../../../tools/mcpm-workbench/src/field/buildFitProfile';
import { catalogBounds } from '../../../../../../tools/mcpm-workbench/src/field/catalogBounds';
import { fitProfileBounds } from '../../../../../../tools/mcpm-workbench/src/field/fitProfileBounds';
import { resolveAutoFitBounds } from '../../../../../../tools/mcpm-workbench/src/ui/GridBoxPanel/utils/resolveAutoFitBounds';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticCatalog(n: number, seed: number): CatalogPoints {
  const rng = mulberry32(seed);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = (rng() - 0.5) * 200;
  return { positions, log10StellarMass: new Float32Array(n), count: n, sources: [] };
}

describe('resolveAutoFitBounds', () => {
  it('at 100%, returns catalogBoundsMpc bit-for-bit — the old Auto fit path, untouched', () => {
    const points = syntheticCatalog(500, 7);
    const bounds = catalogBounds(points.positions);
    expect(resolveAutoFitBounds(points, bounds, 100)).toEqual(bounds);
  });

  it('below 100%, matches fitProfileBounds on the same catalog', () => {
    const points = syntheticCatalog(500, 7);
    const bounds = catalogBounds(points.positions);
    const expected = fitProfileBounds(buildFitProfile(points.positions), 0.85);

    expect(resolveAutoFitBounds(points, bounds, 85)).toEqual({
      min: expected.minMpc,
      max: expected.maxMpc,
    });
  });

  it('falls back to catalogBoundsMpc when points are not yet loaded, regardless of percent', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [10, 10, 10] };
    expect(resolveAutoFitBounds(null, bounds, 80)).toEqual(bounds);
  });
});
