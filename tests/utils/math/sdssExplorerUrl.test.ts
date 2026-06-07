/**
 * Unit tests for `sdssExplorerUrl` — pure URL builder for the SDSS DR18
 * Explore-tool Summary page.
 *
 * The function takes a 64-bit `bigint` objID and interpolates it into a
 * canonical URL.  Tests verify the URL shape and that bigint values
 * exceeding 2^53 are preserved precisely (the whole reason `bigint` is
 * the input type).
 */

import { describe, it, expect } from 'vitest';
import { sdssExplorerUrl } from '../../../src/utils/math/sdssExplorerUrl';

describe('sdssExplorerUrl', () => {
  it('produces a DR18 Explore Summary URL for a small objID', () => {
    // Spot-check the literal URL template in the source.  Any change to the
    // path or the query-param name would break this.
    expect(sdssExplorerUrl(42n)).toBe(
      'https://skyserver.sdss.org/dr18/VisualTools/explore/summary?objId=42',
    );
  });

  it('preserves the full precision of an 18-digit SDSS objID', () => {
    // SDSS objIDs routinely exceed 2^53 (≈ 9 × 10¹⁵).  If the function
    // accepted `number` it would silently truncate the last few digits;
    // accepting `bigint` and string-interpolating preserves every digit.
    const bigID = 1237671121517085000n + 123n; // pattern-typical SDSS objID
    const url = sdssExplorerUrl(bigID);
    expect(url).toContain('objId=1237671121517085123');
  });

  it('handles 0n (synthetic / unknown objID) without crashing', () => {
    // The engine guards against using this URL for objID = 0n at the
    // GalaxyInfo layer, but the URL builder itself is permissive and just
    // string-interpolates the value.
    expect(sdssExplorerUrl(0n)).toBe(
      'https://skyserver.sdss.org/dr18/VisualTools/explore/summary?objId=0',
    );
  });
});
