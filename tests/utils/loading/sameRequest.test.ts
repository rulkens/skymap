/**
 * `sameRequest` is the demand loop's reload guard: it decides whether a freshly
 * built `row.req(tier)` names the same fetch as `slot.lastRequest()`. These cases
 * pin the shallow-equality contract, including its known limitation on nested
 * values — the property `assetWiringRequestShape.test.ts` exists to guard.
 */

import { describe, it, expect } from 'vitest';
import { sameRequest } from '../../../src/utils/loading/sameRequest';

describe('sameRequest', () => {
  it('identical primitives and undefined compare equal', () => {
    expect(sameRequest(undefined, undefined)).toBe(true);
    expect(sameRequest(3, 3)).toBe(true);
    expect(sameRequest(undefined, {})).toBe(false);
  });

  it('structurally equal flat objects compare equal across separate allocations', () => {
    expect(sameRequest({ source: 4, tier: 'large' }, { source: 4, tier: 'large' })).toBe(true);
    expect(sameRequest({ tier: 'large' }, { tier: 'medium' })).toBe(false);
  });

  it('an extra key is a difference in both directions', () => {
    expect(sameRequest({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameRequest({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('a nested object value is never equal across allocations', () => {
    // Known limitation, asserted explicitly: nested values are compared by
    // identity, so two freshly allocated equal-looking nested objects read as
    // different. This is why every ASSET_WIRING row's req must stay flat.
    expect(sameRequest({ inner: { x: 1 } }, { inner: { x: 1 } })).toBe(false);
  });
});
