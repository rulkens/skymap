import { describe, it, expect } from 'vitest';
import {
  parseFamousMeta,
  parseFamousXrefs,
  remapGladeXrefs,
} from '../../../src/services/engine/famousMetaLoader';

describe('parseFamousMeta', () => {
  it('returns a per-localIdx array', () => {
    const json = JSON.stringify([
      { id: 'm31', names: ['M31'], description: 'a', type: 'Sb' },
      { id: 'm51', names: ['M51', 'Whirlpool'], description: 'b', type: 'Sbc' },
    ]);
    const meta = parseFamousMeta(json);
    expect(meta).toHaveLength(2);
    expect(meta[0]!.id).toBe('m31');
    expect(meta[1]!.names).toContain('Whirlpool');
  });

  it('throws on a non-array root', () => {
    expect(() => parseFamousMeta('{}')).toThrow(/array/);
  });
});

describe('parseFamousXrefs', () => {
  it('parses a record keyed by id', () => {
    const json = JSON.stringify({
      m31: { source: 'TwoMRS', localIdx: 12345, distanceArcsec: 4.2 },
      m32: null,
    });
    const xrefs = parseFamousXrefs(json);
    expect(xrefs.m31).not.toBeNull();
    expect(xrefs.m31!.source).toBe('TwoMRS');
    expect(xrefs.m32).toBeNull();
  });
});

describe('remapGladeXrefs', () => {
  // Authoritative model: build a remap that drops index 1 and shifts
  // everyone past it down by one — the simplest test of the remap math.
  // remap[0] = 0 (kept at 0), remap[1] = -1 (dropped), remap[2] = 1
  // (was 2, now 1), remap[3] = 2 (was 3, now 2).
  const remap = new Int32Array([0, -1, 1, 2]);

  it('rewrites surviving Glade indices', () => {
    const xrefs = {
      m31: { source: 'Glade' as const, localIdx: 2, distanceArcsec: 1.0 },
    };
    const out = remapGladeXrefs(xrefs, remap);
    expect(out.m31).toEqual({ source: 'Glade', localIdx: 1, distanceArcsec: 1.0 });
  });

  it('nullifies Glade entries whose row was dropped', () => {
    const xrefs = {
      m51: { source: 'Glade' as const, localIdx: 1, distanceArcsec: 0.4 },
    };
    const out = remapGladeXrefs(xrefs, remap);
    expect(out.m51).toBeNull();
  });

  it('passes TwoMRS entries through unchanged', () => {
    const xrefs = {
      m104: { source: 'TwoMRS' as const, localIdx: 99, distanceArcsec: 2.1 },
    };
    const out = remapGladeXrefs(xrefs, remap);
    expect(out.m104).toEqual({ source: 'TwoMRS', localIdx: 99, distanceArcsec: 2.1 });
  });

  it('passes null entries through unchanged', () => {
    const xrefs = { m666: null };
    const out = remapGladeXrefs(xrefs, remap);
    expect(out.m666).toBeNull();
  });

  it('does not mutate the input map', () => {
    const xrefs = {
      m31: { source: 'Glade' as const, localIdx: 2, distanceArcsec: 1.0 },
    };
    remapGladeXrefs(xrefs, remap);
    expect(xrefs.m31.localIdx).toBe(2);
  });
});
