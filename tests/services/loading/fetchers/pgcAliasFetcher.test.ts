import { describe, expect, it, vi } from 'vitest';
import {
  pgcAliasFetcher,
  parsePgcAliases,
} from '../../../../src/services/loading/fetchers/pgcAliasFetcher';

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
});

describe('pgcAliasFetcher', () => {
  it('fetches and parses', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"1":["X"]}', { status: 200 }));
    const map = await pgcAliasFetcher(
      undefined as void,
      new AbortController().signal,
      () => {},
    );
    expect(map.get(1n)).toEqual(['X']);
  });
});
