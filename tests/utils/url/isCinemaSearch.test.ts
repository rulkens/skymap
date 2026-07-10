/**
 * isCinemaSearch — behavioral coverage for the pure `?cinema` predicate.
 *
 * The parse semantics (bare vs valued flags, empty strings, prefix
 * non-matches) are covered on the shared core in `searchHasGate.test.ts`;
 * this suite asserts only the binding this file owns — the 'cinema' flag
 * spelling.
 */

import { describe, it, expect } from 'vitest';
import { isCinemaSearch } from '../../../src/utils/url/isCinemaSearch';

describe('isCinemaSearch', () => {
  it('returns true when the ?cinema flag is present', () => {
    expect(isCinemaSearch('?cinema')).toBe(true);
  });
});
