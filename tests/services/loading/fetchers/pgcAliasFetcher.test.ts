import { describe, expect, it } from 'vitest';
import { parsePgcAliases } from '../../../../src/services/loading/fetchers/pgcAliasFetcher';

describe('parsePgcAliases', () => {
  it('parses bigint keys', () => {
    const map = parsePgcAliases('{"42":["NGC 1"]}');
    expect(map.get(42n)).toEqual(['NGC 1']);
  });
  it('skips non-array values', () => {
    const map = parsePgcAliases('{"42":"oops","43":["ok"]}');
    expect(map.has(42n)).toBe(false);
    expect(map.get(43n)).toEqual(['ok']);
  });
  it('throws on array root', () => {
    expect(() => parsePgcAliases('[]')).toThrow();
  });
  // The pre-rework loader skipped malformed PGC keys (non-numeric strings)
  // rather than aborting the whole parse — the user gets the rest of the
  // index instead of a null Map on first palette open.  Preserved here so
  // the fetcher has the same fail-tolerant behaviour.
  it('skips malformed PGC keys without aborting the whole parse', () => {
    const json = JSON.stringify({
      '2557': ['NGC 224'],
      'not-a-number': ['XYZ'],
      '42038': ['NGC 4565'],
    });
    const map = parsePgcAliases(json);
    expect(map.size).toBe(2);
    expect(map.has(2557n)).toBe(true);
    expect(map.has(42038n)).toBe(true);
  });
});
