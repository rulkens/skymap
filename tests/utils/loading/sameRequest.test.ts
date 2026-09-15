/**
 * `sameRequest` is the demand loop's reload guard: it decides whether a freshly
 * built `row.req(tier)` names the same fetch as `slot.lastRequest()`. These cases
 * pin the shallow-equality contract; `assetWiringRequestShape.test.ts` pins the
 * matching property over the real registry.
 */

import { describe, it, expect } from 'vitest';
import { sameRequest } from '../../../src/utils/loading/sameRequest';

describe('sameRequest', () => {
  it('structurally equal flat objects compare equal across separate allocations', () => {
    expect(sameRequest({ source: 4, tier: 'large' }, { source: 4, tier: 'large' })).toBe(true);
    expect(sameRequest({ tier: 'large' }, { tier: 'medium' })).toBe(false);
  });

  it('an extra key is a difference in both directions', () => {
    expect(sameRequest({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameRequest({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });
});
