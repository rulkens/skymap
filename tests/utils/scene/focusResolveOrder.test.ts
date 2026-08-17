import { describe, it, expect } from 'vitest';
import { focusResolveOrder } from '../../../src/utils/scene/focusResolveOrder';
import type { AnchorBody } from '../../../src/@types/scene/AnchorBody';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';

/**
 * Synthetic tables throughout. The real focus graph is two levels deep, so
 * pinning depth or a cycle against `ORBITAL_ELEMENTS` would mean seeding a fake
 * body into shipped data to make the case exist.
 */
const ROOT: readonly AnchorBody[] = [{ id: 'root', positionMpc: [0, 0, 0] }];

const row = (id: string, focusId: string): OrbitalElements => ({
  id,
  focusId,
  semiMajorMpc: 1,
  eccentricity: 0,
  inclinationRad: 0,
  ascendingNodeRad: 0,
  argPeriapsisRad: 0,
  meanAnomalyRad: 0,
  color: [1, 1, 1],
});

describe('focusResolveOrder', () => {
  it('a focus chain deeper than one hop resolves', () => {
    // Authored child-first, so table order alone would place `child` before the
    // focus it reads out of the map. Three levels is what the retired two-pass
    // split could not express at all.
    const order = focusResolveOrder(ROOT, [
      row('child', 'parent'),
      row('parent', 'grandparent'),
      row('grandparent', 'root'),
    ]);

    expect(order.map((el) => el.id)).toEqual(['grandparent', 'parent', 'child']);
  });

  it('a focus cycle throws naming both ids', () => {
    expect(() => focusResolveOrder(ROOT, [row('a', 'b'), row('b', 'a')])).toThrow(/a -> b -> a/);
  });

  it('a focus that is neither an anchor nor a row throws naming it', () => {
    expect(() => focusResolveOrder(ROOT, [row('orphan', 'nowhere')])).toThrow(
      /'orphan' names unknown focus 'nowhere'/,
    );
  });
});
