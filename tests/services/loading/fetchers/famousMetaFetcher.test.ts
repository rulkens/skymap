import { describe, expect, it, vi } from 'vitest';
import {
  famousMetaFetcher,
  parseFamousMeta,
  parseFamousXrefs,
} from '../../../../src/services/loading/fetchers/famousMetaFetcher';

describe('parseFamousMeta', () => {
  it('parses valid array', () => {
    expect(
      parseFamousMeta('[{"id":"x","names":["X"],"description":"","type":"galaxy"}]'),
    ).toHaveLength(1);
  });
  it('throws on non-array root', () => {
    expect(() => parseFamousMeta('{}')).toThrow();
  });
});

describe('parseFamousXrefs', () => {
  it('parses object', () => {
    expect(parseFamousXrefs('{"x":null}')).toEqual({ x: null });
  });
  it('throws on array root', () => {
    expect(() => parseFamousXrefs('[]')).toThrow();
  });
});

describe('famousMetaFetcher', () => {
  it('fetches both files and returns combined payload', async () => {
    const seq = [
      new Response('[]', { status: 200 }),
      new Response('{}', { status: 200 }),
    ];
    globalThis.fetch = vi.fn(() => Promise.resolve(seq.shift()!));
    const payload = await famousMetaFetcher(
      undefined as void,
      new AbortController().signal,
      () => {},
    );
    expect(payload).toEqual({ meta: [], xrefs: {} });
  });
});
