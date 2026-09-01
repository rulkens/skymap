/**
 * makeCosmoSlab — one shared builder for the "well-formed COSMO Slab" literal
 * that ~10 pass tests hand-assembled identically inline (the fixed 0.01 → 50000
 * Mpc bracket `deriveSlabs`' COSMO row itself uses). Same churn rationale as
 * `makeSlab` (its NEAR0 counterpart): a new `Slab` field is one edit here.
 */

import type { Slab } from '../../src/@types/engine/frame/Slab';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { COSMO } from '../../src/services/engine/frame/slabs';

export function makeCosmoSlab(overrides: Partial<Slab> = {}): Slab {
  const near = 0.01;
  const far = 50000;
  return {
    index: COSMO,
    near,
    far,
    vp: new Float64Array(16),
    frame: { kind: 'world-mpc', originRelative: false },
    distanceRangeM: [near * SCALE_UNITS.MPC_TO_M, far * SCALE_UNITS.MPC_TO_M],
    precision: 'f32',
    reversedZ: false,
    ...overrides,
  };
}
