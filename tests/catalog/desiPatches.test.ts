import { describe, it, expect } from 'vitest';
import { DESI_PATCHES, DESI_CONE } from '../../tools/catalog/desiPatches';

/**
 * DESI_PATCHES shape — the build loops this table (one `.bin` per row) and
 * buckets crossMatch output by each patch's `source`, so a collision on either
 * of the two identity axes (key / source) would silently merge or overwrite
 * two patches' outputs. `source` uniqueness already guarantees unique `.bin`
 * stems too — the stem comes from `SOURCE_REGISTRY[source].binBaseName`, one
 * registry entry per `Source` — so there is no separate binName axis to pin.
 * These pin the axes are all distinct.
 */
describe('DESI_PATCHES', () => {
  it('has unique keys', () => {
    const keys = DESI_PATCHES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has unique sources', () => {
    const sources = DESI_PATCHES.map((p) => p.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("each row's makeFilter builds a callable 3-arg predicate", () => {
    // The predicate takes (raDeg, decDeg, z); sky-only patches ignore z, the
    // depth-bounded Sloan Great Wall uses it. All must return a boolean either way.
    for (const patch of DESI_PATCHES) {
      const keep = patch.makeFilter();
      expect(typeof keep(DESI_CONE.raDeg, DESI_CONE.decDeg, 0.075)).toBe('boolean');
    }
  });

  it('the cone predicate accepts its own center', () => {
    const cone = DESI_PATCHES.find((p) => p.key === 'cone')!;
    expect(cone.makeFilter()(DESI_CONE.raDeg, DESI_CONE.decDeg, 0.075)).toBe(true);
  });

  it('the sgw ellipsoid-union predicate rejects a deep-background galaxy', () => {
    // The Sloan Great Wall is selected by a smooth union of ellipsoids on the
    // wall's density peaks. A galaxy at z=0.5 in the wall's sky direction sits
    // far outside every ellipsoid → the union field is large-positive → rejected.
    // (The interior accept is probabilistic per row, so the robust deterministic
    // assertion is the outside extreme.)
    const sgw = DESI_PATCHES.find((p) => p.key === 'sgw')!;
    const keep = sgw.makeFilter();
    expect(keep(175, 1.5, 0.5)).toBe(false);
  });
});
