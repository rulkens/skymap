/**
 * Tests for galaxyCatalogFetcher.
 *
 * When the tier target is non-zero (or absent — meaning "no cap") the fetcher
 * must call fetch and decode the resulting buffer.
 *
 * Decode-correctness is exercised exhaustively in
 * `tests/galaxyCatalogFormat.test.ts`; here we only assert that fetch is
 * actually invoked and that a header-only .bin round-trips to a
 * count=0 catalog.
 */
import { describe, expect, it } from 'vitest';
import { galaxyCatalogFetcher } from '../../../../src/layers/galaxyCatalog/load/galaxyCatalogFetcher';
import {
  encodeGalaxyCatalog,
  emptyGalaxyCatalog,
} from '../../../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { Source } from '../../../../src/data/sources';
import { useFetchMock } from '../../../setup/fetchMock';

describe('galaxyCatalogFetcher', () => {
  const fetch = useFetchMock();

  it('fetches and decodes when target is non-zero', async () => {
    // Build a minimal valid .bin (header only, count=0) via the format's own
    // encoder rather than hand-rolling the header — that way the fixture
    // tracks the current format version automatically instead of pinning a
    // literal that breaks on every version bump.
    const header = encodeGalaxyCatalog(emptyGalaxyCatalog());

    fetch.mock.mockResolvedValue(
      new Response(header, {
        status: 200,
        headers: { 'Content-Length': String(header.byteLength) },
      }),
    );

    // 2MRS has no entry in TIER_TARGETS.medium → target is undefined
    // (i.e. "no cap"), which is NOT 0, so the fetch path runs.
    const cloud = await galaxyCatalogFetcher(
      { source: Source.TwoMRS, tier: 'medium' },
      new AbortController().signal,
      () => {},
    );

    expect(cloud.count).toBe(0);
    expect(fetch.mock).toHaveBeenCalledTimes(1);
    const url = fetch.mock.mock.calls[0]?.[0] as string;
    expect(url).toContain('2mrs.bin');
  });
});
