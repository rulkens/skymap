import { describe, it, expect } from 'vitest';
import { DESI_PATCHES, DESI_CONE } from '../../tools/catalog/desiPatches';
import { Source } from '../../src/data/sources';

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

  it('ships the cone (DesiDeep) and wedge (DesiWedge) patches', () => {
    const bySource = new Map(DESI_PATCHES.map((p) => [p.source, p]));
    expect(bySource.has(Source.DesiDeep)).toBe(true);
    expect(bySource.has(Source.DesiWedge)).toBe(true);
  });

  it("each row's makeFilter builds a callable predicate", () => {
    for (const patch of DESI_PATCHES) {
      const keep = patch.makeFilter();
      expect(typeof keep(DESI_CONE.raDeg, DESI_CONE.decDeg)).toBe('boolean');
    }
  });

  it('the cone predicate accepts its own center', () => {
    const cone = DESI_PATCHES.find((p) => p.key === 'cone')!;
    expect(cone.makeFilter()(DESI_CONE.raDeg, DESI_CONE.decDeg)).toBe(true);
  });
});
