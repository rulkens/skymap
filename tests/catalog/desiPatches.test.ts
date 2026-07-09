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

  it('ships the cone (DesiDeep), wedge (DesiWedge), and sgw (DesiSgw) patches', () => {
    const bySource = new Map(DESI_PATCHES.map((p) => [p.source, p]));
    expect(bySource.has(Source.DesiDeep)).toBe(true);
    expect(bySource.has(Source.DesiWedge)).toBe(true);
    expect(bySource.has(Source.DesiSgw)).toBe(true);
  });

  it("each row's makeFilter builds a callable 3-arg predicate", () => {
    // The predicate takes (raDeg, decDeg, z); sky-only patches ignore z, the
    // depth-bounded box uses it. All must return a boolean either way.
    for (const patch of DESI_PATCHES) {
      const keep = patch.makeFilter();
      expect(typeof keep(DESI_CONE.raDeg, DESI_CONE.decDeg, 0.075)).toBe('boolean');
    }
  });

  it('the cone predicate accepts its own center', () => {
    const cone = DESI_PATCHES.find((p) => p.key === 'cone')!;
    expect(cone.makeFilter()(DESI_CONE.raDeg, DESI_CONE.decDeg, 0.075)).toBe(true);
  });

  it('the sgw box predicate bounds the line of sight, not just the sky window', () => {
    // A point inside the RA×Dec window is kept only when its redshift falls in
    // the wall's shell — the depth bound is what makes this box a bounded volume
    // rather than an infinite drill.
    const sgw = DESI_PATCHES.find((p) => p.key === 'sgw')!;
    const keep = sgw.makeFilter();
    expect(keep(175, 1.5, 0.075)).toBe(true);
    // Same sky position, foreground redshift → out (in front of the wall).
    expect(keep(175, 1.5, 0.02)).toBe(false);
  });
});
