/**
 * makeSlab — one shared builder for the "well-formed NEAR0 Slab" literal that
 * ~15 pass tests hand-assembled identically inline. Centralising it means a
 * new `Slab` field (like `distanceRangeM`, this task) is one edit here instead
 * of ~15 identical breakages.
 *
 * The default `near`/`far` (0.0005 / 500 Mpc) and `vp` are arbitrary but
 * non-degenerate — most callers pass only `vp`/`reversedZ` overrides, since
 * the layers under test read `vp`/`camPos`, not the depth bracket itself.
 */

import type { Slab } from '../../src/@types/engine/frame/Slab';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { NEAR0 } from '../../src/services/engine/frame/slabs';

export function makeSlab(overrides: Partial<Slab> = {}): Slab {
  const near = 0.0005;
  const far = 500;
  return {
    index: NEAR0,
    near,
    far,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    frame: { kind: 'world-mpc', originRelative: true },
    distanceRangeM: [near * SCALE_UNITS.MPC_TO_M, far * SCALE_UNITS.MPC_TO_M],
    precision: 'f64',
    reversedZ: false,
    ...overrides,
  };
}
