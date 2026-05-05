import { describe, it, expect } from 'vitest';
import {
  parseFamousMeta,
  parseFamousXrefs,
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

