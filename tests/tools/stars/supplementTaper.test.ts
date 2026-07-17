import { describe, expect, it } from 'vitest';

import { keepStar } from '../../../tools/stars/supplementTaper';

/**
 * The taper thins the GCNS supplement's outer shell (70→100 pc) via a pure hash
 * of each star's `source_id`, so these assertions pin exact keep/drop booleans
 * rather than statistics. The two 85 pc source_ids (p = 0.5) are real Gaia DR3
 * ids whose `hash01` was computed from the implementation — Barnard's Star
 * (0.4735 < 0.5 → kept) and Ross 154 (0.9589 ≥ 0.5 → dropped). If the hash
 * schedule drifts, those booleans flip and the test fails.
 */
describe('keepStar (supplement taper)', () => {
  it('keeps every supplement star inside the taper start', () => {
    expect(keepStar({ sourceId: 12345n, distPc: 60, isSupplement: true })).toBe(true);
    expect(keepStar({ sourceId: 999999999999n, distPc: 60, isSupplement: true })).toBe(true);
  });

  it('drops every supplement star at or beyond the taper end', () => {
    expect(keepStar({ sourceId: 12345n, distPc: 100, isSupplement: true })).toBe(false);
    expect(keepStar({ sourceId: 999999999999n, distPc: 110, isSupplement: true })).toBe(false);
  });

  it('decides a 85 pc supplement star (p=0.5) by its identity hash', () => {
    // Barnard's Star — hash01 ≈ 0.4735 < 0.5 → kept.
    expect(keepStar({ sourceId: 4472832130942575872n, distPc: 85, isSupplement: true })).toBe(true);
    // Ross 154 — hash01 ≈ 0.9589 ≥ 0.5 → dropped.
    expect(keepStar({ sourceId: 4075141768785646848n, distPc: 85, isSupplement: true })).toBe(false);
  });

  it('never taper-drops a main-catalog star, even near the shell', () => {
    // Ross 154's hash would drop it as a supplement at 85 pc; as a main row it
    // is kept unconditionally, and a main row at 99 pc is likewise untouched.
    expect(keepStar({ sourceId: 4075141768785646848n, distPc: 85, isSupplement: false })).toBe(
      true,
    );
    expect(keepStar({ sourceId: 4075141768785646848n, distPc: 99, isSupplement: false })).toBe(
      true,
    );
  });
});
