/**
 * resolveAutoFitBounds — at 100% must reproduce today's plain-`catalogBoundsMpc`
 * Auto fit path bit-for-bit (not merely "close", since `buildFitProfile` sorts
 * by a different key and only coincidentally agrees at the full set); below
 * 100% it defers to `fitProfileBounds`, already covered by its own suite.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import { mulberry32 } from '../../../../../../src/utils/random/mulberry32';
import type { CatalogPoints } from '../../../../../../tools/mcpm-workbench/@types/CatalogPoints';
import { catalogBounds } from '../../../../../../tools/mcpm-workbench/src/field/catalogBounds';
import { resolveAutoFitBounds } from '../../../../../../tools/mcpm-workbench/src/ui/GridBoxPanel/utils/resolveAutoFitBounds';

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

  it('falls back to catalogBoundsMpc when points are not yet loaded, regardless of percent', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [10, 10, 10] };
    expect(resolveAutoFitBounds(null, bounds, 80)).toEqual(bounds);
  });
});
