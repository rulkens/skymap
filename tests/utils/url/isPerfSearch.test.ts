/**
 * isPerfSearch — behavioral coverage for the pure `?perf` predicate.
 *
 * The parse semantics (bare vs valued flags, empty strings, prefix
 * non-matches) are covered on the shared core in `searchHasGate.test.ts`;
 * this suite asserts only the binding this file owns — the 'perf' flag
 * spelling, and that it is an exact-key match (`performance` is not `perf`).
 */

import { describe, it, expect } from 'vitest';
import { isPerfSearch } from '../../../src/utils/url/isPerfSearch';

describe('isPerfSearch', () => {
  it('returns true when the ?perf flag is present', () => {
    expect(isPerfSearch('?perf')).toBe(true);
  });

  it('returns true for the valued form ?perf=1 (presence, not value)', () => {
    expect(isPerfSearch('?perf=1')).toBe(true);
  });

  it('returns false for an empty search string', () => {
    expect(isPerfSearch('')).toBe(false);
  });

  it('returns false for a different gate (?cinema)', () => {
    expect(isPerfSearch('?cinema')).toBe(false);
  });

  it('returns false for a non-exact key (?performance)', () => {
    expect(isPerfSearch('?performance')).toBe(false);
  });
});
