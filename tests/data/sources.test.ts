import { describe, it, expect } from 'vitest';
import { Source, SOURCE_REGISTRY } from '../../src/data/sources';
import { maskHas } from '../../src/utils/maskHas';

// Default-visible galaxy catalog bits: 1 (SDSS), 2 (2MRS), 3 (Glade),
// 4 (Famous), 8 (Milliquas). The DESI patches (bits 18-20) and the
// structure codes (5/6/7) stay clear — see the test below.
const VISIBLE_MASK = 0b100011110;

describe('Source.FamousGalaxy', () => {
  it('has integer value 4 (next free slot after Glade=3)', () => {
    expect(Source.FamousGalaxy).toBe(4);
  });
});

describe('SOURCE_REGISTRY ids', () => {
  const ids = Object.values(SOURCE_REGISTRY).map((e) => e.id);

  it('ids are unique across the registry', () => {
    // The id is the single home for each source's readable key — domain
    // types (StructureId, visibility records, volume handles) derive
    // from it, so a collision would silently merge two sources downstream.
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Source enum — structure codes (cluster/supercluster/void)', () => {
  it('appends Cluster=5, Supercluster=6, Void=7 to the enum', () => {
    expect(Source.Cluster).toBe(5);
    expect(Source.Supercluster).toBe(6);
    expect(Source.Void).toBe(7);
  });

  it('maskHas reads a galaxy catalog visibility mask without structure bits leaking in', () => {
    expect(maskHas(VISIBLE_MASK, Source.Milliquas)).toBe(true);
    expect(maskHas(VISIBLE_MASK, Source.DesiDeep)).toBe(false);
    expect(maskHas(VISIBLE_MASK, Source.DesiWedge)).toBe(false);
    expect(maskHas(VISIBLE_MASK, Source.DesiSgw)).toBe(false);
    expect(maskHas(VISIBLE_MASK, Source.Cluster)).toBe(false);
    expect(maskHas(VISIBLE_MASK, Source.Supercluster)).toBe(false);
    expect(maskHas(VISIBLE_MASK, Source.Void)).toBe(false);
  });
});
