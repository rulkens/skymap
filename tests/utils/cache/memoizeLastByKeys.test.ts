/**
 * memoizeLastByKeys backs every dust-CDF/forcing-field cache in the galaxy
 * generator (hiiRegions.ts, galaxyIsmMapArmForcing.ts) — a wrong hit there
 * silently freezes a field that should have recomputed, and a wrong miss
 * silently doubles an O(rings x az) bake per frame. Both are invisible in
 * the generator's own output tests (the value is correct either way; only
 * WHICH build ran differs), so the eviction/comparison contract needs its
 * own coverage.
 */
import { describe, it, expect, vi } from 'vitest';

import { memoizeLastByKeys } from '../../../src/utils/cache/memoizeLastByKeys';

describe('memoizeLastByKeys', () => {
  it('recomputes only when a key element changes, by Object.is', () => {
    const build = vi.fn(() => ({}));
    const memo = memoizeLastByKeys<object>();

    const a = memo.get([1, 'x'], build);
    const b = memo.get([1, 'x'], build);
    expect(b).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);

    const c = memo.get([2, 'x'], build);
    expect(c).not.toBe(a);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('hits on a shared NaN key element (Object.is, not ===)', () => {
    const build = vi.fn(() => ({}));
    const memo = memoizeLastByKeys<object>();

    const a = memo.get([NaN], build);
    const b = memo.get([NaN], build);
    expect(b).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('keeps only the single last slot — an intervening different key evicts the earlier one', () => {
    const build = vi.fn(() => ({}));
    const memo = memoizeLastByKeys<object>();

    const a = memo.get(['a'], build);
    memo.get(['b'], build);
    const aAgain = memo.get(['a'], build);
    expect(aAgain).not.toBe(a);
    expect(build).toHaveBeenCalledTimes(3);
  });
});
