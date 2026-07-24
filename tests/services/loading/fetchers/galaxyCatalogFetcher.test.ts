/**
 * Tests for galaxyCatalogFetcher.
 *
 * Two scenarios are covered here:
 *
 *   1. Excluded-tier short-circuit: TIER_TARGETS[tier][source] === 0 must
 *      yield an empty GalaxyCatalog and MUST NOT touch the network.
 *   2. Happy path: when target is non-zero (or absent — meaning "no cap")
 *      the fetcher must call fetch and decode the resulting buffer.
 *
 * Decode-correctness is exercised exhaustively in
 * `tests/galaxyCatalogFormat.test.ts`; here we only assert that fetch is
 * actually invoked and that a header-only .bin round-trips to a
 * count=0 catalog.
 */
import { describe, expect, it } from 'vitest';
import { galaxyCatalogFetcher } from '../../../../src/services/loading/fetchers/galaxyCatalogFetcher';
import {
  encodeGalaxyCatalog,
  emptyGalaxyCatalog,
} from '../../../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { Source } from '../../../../src/data/sources';
import { useFetchMock } from '../../../setup/fetchMock';

describe('galaxyCatalogFetcher', () => {
  const fetch = useFetchMock();

  it('returns empty catalog and skips fetch when target is 0 for the tier', async () => {
    // SDSS at `small` tier has target=0 in TIER_TARGETS — verified against
    // src/data/tierTargets.ts at the time this test was written.  If the
    // table changes, pick another (source, tier) pair where the target IS 0.
    const cloud = await galaxyCatalogFetcher(
      { source: Source.SDSS, tier: 'small' },
      new AbortController().signal,
      () => {},
    );

    expect(cloud.count).toBe(0);
    expect(cloud.objIDs.length).toBe(0);
    expect(cloud.positions.length).toBe(0);
    expect(cloud.diameterKpc.length).toBe(0);
    // Crucial: no URL was hit — the short-circuit is not just a value
    // mapping, it must skip the network entirely.
    expect(fetch.mock).not.toHaveBeenCalled();
  });

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
