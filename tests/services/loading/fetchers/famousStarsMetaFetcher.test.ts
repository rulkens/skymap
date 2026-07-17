import { describe, expect, it } from 'vitest';
import {
  famousStarsMetaFetcher,
  parseFamousStarsMeta,
} from '../../../../src/services/loading/fetchers/famousStarsMetaFetcher';
import { useFetchMock } from '../../../setup/fetchMock';

describe('parseFamousStarsMeta', () => {
  it('parses an array of entries', () => {
    expect(
      parseFamousStarsMeta(
        '[{"id":"sirius","names":["Sirius"],"constellation":"CMa","spectralType":"A1V","distancePc":2.64,"magV":-1.46,"absMag":1.42,"radiusSolar":1.71,"temperatureK":9940,"description":""}]',
      ),
    ).toHaveLength(1);
  });
  it('rejects a non-array root', () => {
    expect(() => parseFamousStarsMeta('{}')).toThrow();
  });
});

describe('famousStarsMetaFetcher', () => {
  const fetch = useFetchMock();

  it('fetches famous_stars_meta.json and returns the parsed payload', async () => {
    fetch.mock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const payload = await famousStarsMetaFetcher(
      { tier: 'medium' },
      new AbortController().signal,
      () => {},
    );
    expect(payload).toEqual({ meta: [] });
  });

  it('rejects on a non-2xx HTTP status', async () => {
    fetch.mock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      famousStarsMetaFetcher({ tier: 'medium' }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('rejects when the JSON body is malformed', async () => {
    fetch.mock.mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    await expect(
      famousStarsMetaFetcher({ tier: 'medium' }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });
});
