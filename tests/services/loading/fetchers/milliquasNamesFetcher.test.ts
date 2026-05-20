import { describe, expect, it } from 'vitest';
import {
  milliquasNamesFetcher,
  parseMilliquasNames,
} from '../../../../src/services/loading/fetchers/milliquasNamesFetcher';
import { useFetchMock } from '../../../setup/fetchMock';

describe('parseMilliquasNames', () => {
  it('parses a valid sidecar payload', () => {
    const out = parseMilliquasNames(
      '{"names":["3C 273","PKS 0405-12"],"classes":["Q","Q"]}',
    );
    expect(out.names).toEqual(['3C 273', 'PKS 0405-12']);
    expect(out.classes).toEqual(['Q', 'Q']);
  });

  it('throws on array root', () => {
    expect(() => parseMilliquasNames('[]')).toThrow();
  });

  it('throws when names is not an array', () => {
    expect(() => parseMilliquasNames('{"names":"x","classes":[]}')).toThrow();
  });

  it('throws when classes is not an array', () => {
    expect(() => parseMilliquasNames('{"names":[],"classes":"x"}')).toThrow();
  });

  it('throws when names and classes have different lengths', () => {
    expect(() =>
      parseMilliquasNames('{"names":["a","b"],"classes":["Q"]}'),
    ).toThrow(/length mismatch/);
  });
});

describe('milliquasNamesFetcher', () => {
  const fetch = useFetchMock();

  it('short-circuits the small tier with an empty payload (no network)', async () => {
    const payload = await milliquasNamesFetcher(
      { tier: 'small' },
      new AbortController().signal,
      () => {},
    );
    expect(payload).toEqual({ names: [], classes: [] });
    expect(fetch.mock).not.toHaveBeenCalled();
  });

  it('fetches the medium-tier sidecar', async () => {
    fetch.mock.mockResolvedValue(
      new Response('{"names":["3C 273"],"classes":["Q"]}', { status: 200 }),
    );
    const payload = await milliquasNamesFetcher(
      { tier: 'medium' },
      new AbortController().signal,
      () => {},
    );
    expect(payload.names).toEqual(['3C 273']);
    expect(payload.classes).toEqual(['Q']);
    // Sanity-check the URL: medium tier → milliquas-medium_names.json
    const call = fetch.mock.mock.calls[0]!;
    expect(String(call[0])).toContain('milliquas-medium_names.json');
  });

  it('fetches the large-tier sidecar', async () => {
    fetch.mock.mockResolvedValue(
      new Response('{"names":["X"],"classes":["A"]}', { status: 200 }),
    );
    await milliquasNamesFetcher(
      { tier: 'large' },
      new AbortController().signal,
      () => {},
    );
    const call = fetch.mock.mock.calls[0]!;
    expect(String(call[0])).toContain('milliquas-large_names.json');
  });

  it('rejects on a non-2xx HTTP status', async () => {
    fetch.mock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      milliquasNamesFetcher({ tier: 'medium' }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('rejects when the body is malformed JSON', async () => {
    fetch.mock.mockResolvedValue(new Response('not-json', { status: 200 }));
    await expect(
      milliquasNamesFetcher({ tier: 'medium' }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });
});
