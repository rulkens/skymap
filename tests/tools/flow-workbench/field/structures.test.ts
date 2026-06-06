/**
 * structureWorld / placeStructures — anchor tests for the verified CF4++ mapping.
 *
 * These pin the placement so a later change to the shared SG transform or the
 * box-mapping constants is caught. The expected values were obtained by running
 * the mapping (the spike's cross-match-verified fit), NOT hand-computed — for a
 * numeric coordinate transform the running output IS the specification.
 */
import { describe, expect, it } from 'vitest';
import { structureWorld } from '../../../../tools/flow-workbench/src/field/structureWorld';
import { placeStructures } from '../../../../tools/flow-workbench/src/field/placeStructures';
import { STRUCTURE_CATALOG } from '../../../../tools/flow-workbench/src/field/structureCatalog';

const hypot = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);

describe('structureWorld', () => {
  it('maps the Milky Way (dist 0) to the cube centre', () => {
    expect(structureWorld(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('places Virgo (16.5 Mpc) very near the centre', () => {
    const w = structureWorld(187.7, 12.39, 16.5);
    expect(hypot(w)).toBeLessThan(0.05);
  });

  it('places Shapley (200 Mpc) partway toward the edge, farther than Virgo', () => {
    const shapley = structureWorld(201.99, -31.5, 200);
    const virgo = structureWorld(187.7, 12.39, 16.5);
    // 200 Mpc x h(0.77) / 500 Mpc half-box ≈ 0.31 of the cube radius — NOT >0.5.
    expect(hypot(shapley)).toBeGreaterThan(0.25);
    expect(hypot(shapley)).toBeLessThan(0.35);
    expect(hypot(shapley)).toBeGreaterThan(hypot(virgo));
  });

  it('matches the verified Shapley world position (regression pin)', () => {
    const w = structureWorld(201.99, -31.5, 200);
    expect(w[0]).toBeCloseTo(-0.007, 2);
    expect(w[1]).toBeCloseTo(0.16, 2);
    expect(w[2]).toBeCloseTo(-0.266, 2);
  });

  it('keeps every catalogued structure inside the world cube [-1,1]', () => {
    for (const s of STRUCTURE_CATALOG) {
      const w = structureWorld(s.raDeg, s.decDeg, s.distMpc);
      for (const c of w) expect(Math.abs(c)).toBeLessThanOrEqual(1);
    }
  });
});

describe('placeStructures', () => {
  it('returns one PlacedStructure per catalog entry, names preserved', () => {
    const placed = placeStructures(STRUCTURE_CATALOG);
    expect(placed).toHaveLength(STRUCTURE_CATALOG.length);
    expect(placed.map((p) => p.name)).toEqual(STRUCTURE_CATALOG.map((s) => s.name));
  });

  it('places the Milky Way entry at the origin', () => {
    const placed = placeStructures(STRUCTURE_CATALOG);
    const mw = placed.find((p) => p.name === 'us (MW)');
    expect(mw?.world).toEqual([0, 0, 0]);
  });
});
