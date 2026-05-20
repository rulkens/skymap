import { describe, expect, it } from 'vitest';
import {
  famousMetaFetcher,
  parseFamousMeta,
  parseFamousXrefs,
} from '../../../../src/services/loading/fetchers/famousMetaFetcher';
import { useFetchMock } from '../../../setup/fetchMock';

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
  const fetch = useFetchMock();

  it('fetches both files and returns combined payload', async () => {
    fetch.mock
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const payload = await famousMetaFetcher(
      { tier: "medium" },
      new AbortController().signal,
      () => {},
    );
    expect(payload).toEqual({ meta: [], xrefs: {} });
  });

  it('rejects on a non-2xx HTTP status', async () => {
    fetch.mock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      famousMetaFetcher({ tier: "medium" }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('rejects when an inner JSON body is malformed', async () => {
    fetch.mock
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(
      famousMetaFetcher({ tier: "medium" }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('aborts when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    // Real fetch (and undici/jsdom's fetch) reject synchronously when
    // handed an already-aborted signal; emulate that here so the test
    // catches a regression where the fetcher swallows the abort and
    // still resolves.  Plain `vi.fn().mockResolvedValue(Response)`
    // would ignore the signal entirely and the test would pass for
    // unrelated reasons (e.g. parser rejection of an empty body).
    fetch.mock.mockImplementation((_url, init) => {
      const sig = (init as RequestInit | undefined)?.signal;
      if (sig?.aborted) {
        return Promise.reject(
          new DOMException('The operation was aborted.', 'AbortError'),
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    await expect(
      famousMetaFetcher({ tier: "medium" }, controller.signal, () => {}),
    ).rejects.toThrow();
  });
});
