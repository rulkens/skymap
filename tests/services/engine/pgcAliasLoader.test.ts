import { describe, it, expect } from 'vitest';
import { parsePgcAliases } from '../../../src/services/engine/pgcAliasLoader';

describe('parsePgcAliases', () => {
  it('parses a typical sidecar into a bigint-keyed Map', () => {
    const json = JSON.stringify({
      '2557': ['NGC 224', 'M 31', 'UGC 454'],
      '42038': ['NGC 4565', 'UGC 7772'],
    });
    const map = parsePgcAliases(json);
    expect(map.size).toBe(2);
    expect(map.get(2557n)).toEqual(['NGC 224', 'M 31', 'UGC 454']);
    expect(map.get(42038n)).toEqual(['NGC 4565', 'UGC 7772']);
  });

  it('returns an empty Map for an empty object', () => {
    const map = parsePgcAliases('{}');
    expect(map.size).toBe(0);
  });

  it('throws on a non-object root', () => {
    expect(() => parsePgcAliases('[]')).toThrow(/object/);
    expect(() => parsePgcAliases('null')).toThrow(/object/);
  });

  it('skips entries with non-array values rather than throwing', () => {
    const json = JSON.stringify({
      '2557': ['NGC 224'],
      '12345': 'not an array',
    });
    const map = parsePgcAliases(json);
    expect(map.size).toBe(1);
    expect(map.get(2557n)).toEqual(['NGC 224']);
  });

  it('skips malformed PGC keys without aborting the whole parse', () => {
    const json = JSON.stringify({
      '2557': ['NGC 224'],
      'not-a-number': ['XYZ'],
      '42038': ['NGC 4565'],
    });
    const map = parsePgcAliases(json);
    // Both numeric keys parsed; the malformed key was silently skipped.
    expect(map.size).toBe(2);
    expect(map.has(2557n)).toBe(true);
    expect(map.has(42038n)).toBe(true);
  });
});
