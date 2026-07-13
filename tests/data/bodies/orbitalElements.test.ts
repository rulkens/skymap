import { describe, it, expect } from 'vitest';
import { ORBITAL_ELEMENTS } from '../../../src/data/bodies/orbitalElements';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';

/**
 * Invariants only (per testing.md). The seeded element VALUES are verified
 * against JPL in the spec, not re-asserted here — a value restatement would
 * only mirror the source. What CAN break silently is the table's structure:
 * a duplicate id, a dangling parentId, or an out-of-range element that the
 * Keplerian math downstream would consume as garbage. Those are pinned.
 */
describe('ORBITAL_ELEMENTS has a valid structure', () => {
  it('gives every body a unique id', () => {
    const ids = ORBITAL_ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every non-null parentId to a real body', () => {
    // A parent focus is either another orbit in this table or a seeded scene
    // body (the Moon orbits Earth). A dangling parentId would leave a trail
    // orbiting nothing.
    const known = new Set<string>([
      ...ORBITAL_ELEMENTS.map((e) => e.id),
      ...SCENE_BODIES.map((b) => b.id),
    ]);
    for (const e of ORBITAL_ELEMENTS) {
      if (e.parentId !== null) expect(known.has(e.parentId)).toBe(true);
    }
  });

  it('keeps every eccentricity in the bound orbit range [0, 1)', () => {
    // e < 1 is what makes the conic an ellipse; e = 1 (parabola) or e > 1
    // (hyperbola) would break the unit-circle parameterisation the trail rests
    // on and the a(1 − e) periapsis magnitude.
    for (const e of ORBITAL_ELEMENTS) {
      expect(e.eccentricity).toBeGreaterThanOrEqual(0);
      expect(e.eccentricity).toBeLessThan(1);
    }
  });

  it('gives every orbit a positive semi-major axis', () => {
    for (const e of ORBITAL_ELEMENTS) {
      expect(e.semiMajorMpc).toBeGreaterThan(0);
    }
  });
});
