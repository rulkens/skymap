// @vitest-environment jsdom
/**
 * isCinemaMode — unit coverage for the `?cinema` recorder-capture flag.
 *
 * The util is a named wrapper over `hasUrlGate('cinema')`, so the coverage
 * mirrors `hasUrlGate.test.ts`: presence (bare or valued) → true, absence /
 * empty search → false. jsdom's `window.location` is swapped for a writable
 * replacement per test — same technique as the hasUrlGate suite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCinemaMode } from '../../../src/utils/url/isCinemaMode';

describe('isCinemaMode', () => {
  let originalSearch: string;

  beforeEach(() => {
    originalSearch = window.location.search;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: originalSearch },
    });
  });

  function setSearch(s: string): void {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: s },
    });
  }

  it('returns true when the bare ?cinema flag is present', () => {
    setSearch('?cinema');
    expect(isCinemaMode()).toBe(true);
  });

  it('returns true when the param has a value', () => {
    setSearch('?cinema=1');
    expect(isCinemaMode()).toBe(true);
  });

  it('returns false when the param is absent', () => {
    setSearch('?tour=grandTour');
    expect(isCinemaMode()).toBe(false);
  });

  it('returns false for an empty query string', () => {
    setSearch('');
    expect(isCinemaMode()).toBe(false);
  });

  it('finds cinema among multiple params (the recorder loads ?cinema&tour=…)', () => {
    setSearch('?tour=grandTour&cinema');
    expect(isCinemaMode()).toBe(true);
  });
});
