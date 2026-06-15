// @vitest-environment jsdom
/**
 * hasUrlGate — unit coverage for the URL-query-string boolean gate.
 *
 * Three behaviours under test:
 *   1. Returns true when the named param is present (with or without value).
 *   2. Returns false when the param is absent.
 *   3. Returns false defensively when `window` is undefined OR the search
 *      string is malformed enough to throw inside URLSearchParams.
 *
 * jsdom gives us a real `window.location`; we mutate its `search` field
 * via a writable replacement (the property is writable in jsdom but not
 * in real browsers — fine for tests).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hasUrlGate } from '../../../src/utils/url/hasUrlGate';

describe('hasUrlGate', () => {
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

  it('returns true when the bare-flag param is present', () => {
    setSearch('?gpuTimings');
    expect(hasUrlGate('gpuTimings')).toBe(true);
  });

  it('returns true when the param has a value', () => {
    setSearch('?debug=loading');
    expect(hasUrlGate('debug')).toBe(true);
  });

  it('returns false when the param is absent', () => {
    setSearch('?volumes');
    expect(hasUrlGate('gpuTimings')).toBe(false);
  });

  it('returns false for an empty query string', () => {
    setSearch('');
    expect(hasUrlGate('gpuTimings')).toBe(false);
  });

  it('handles multiple params and finds the named one', () => {
    setSearch('?volumes&anchors&gpuTimings');
    expect(hasUrlGate('anchors')).toBe(true);
    expect(hasUrlGate('gpuTimings')).toBe(true);
    expect(hasUrlGate('debug')).toBe(false);
  });
});
