import { describe, expect, it } from 'vitest';
import {
  famousGalaxiesMetaFetcher,
  parseFamousGalaxiesMeta,
} from '../../../../src/services/loading/fetchers/famousGalaxiesMetaFetcher';
import { useFetchMock } from '../../../setup/fetchMock';

describe('parseFamousGalaxiesMeta', () => {
  it('parses valid array', () => {
    expect(
      parseFamousGalaxiesMeta('[{"id":"x","names":["X"],"description":"","type":"galaxy"}]'),
    ).toHaveLength(1);
  });
  it('throws on non-array root', () => {
    expect(() => parseFamousGalaxiesMeta('{}')).toThrow();
  });
});

describe('famousGalaxiesMetaFetcher', () => {
  const fetch = useFetchMock();

  it('fetches famous_galaxies_meta.json and returns the parsed payload', async () => {
    fetch.mock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const payload = await famousGalaxiesMetaFetcher(
      { tier: 'medium' },
      new AbortController().signal,
      () => {},
    );
    expect(payload).toEqual({ meta: [] });
  });

  it('rejects on a non-2xx HTTP status', async () => {
    fetch.mock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      famousGalaxiesMetaFetcher({ tier: 'medium' }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('rejects when the JSON body is malformed', async () => {
    fetch.mock.mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    await expect(
      famousGalaxiesMetaFetcher({ tier: 'medium' }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('aborts when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    // Real fetch (and undici/jsdom's fetch) reject synchronously when
    // handed an already-aborted signal; emulate that here so the test
    // catches a regression where the fetcher swallows the abort and
    // still resolves.
    fetch.mock.mockImplementation((_url, init) => {
      const sig = (init as RequestInit | undefined)?.signal;
      if (sig?.aborted) {
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    await expect(
      famousGalaxiesMetaFetcher({ tier: 'medium' }, controller.signal, () => {}),
    ).rejects.toThrow();
  });
});
