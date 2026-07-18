// @vitest-environment jsdom
/**
 * hasUrlGate — behavioral coverage for the live-window URL-gate wrapper.
 *
 * The parse semantics (bare vs valued flags, empty strings, multi-param
 * search, prefix non-matches) are covered on the pure core in
 * `searchHasGate.test.ts`; this suite asserts only the wrapper's own
 * behavior — that it reads the CURRENT `window.location.search`.
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

  it('returns true when the named gate is in window.location.search', () => {
    setSearch('?gpuTimings');
    expect(hasUrlGate('gpuTimings')).toBe(true);
  });

  it('returns false when the named gate is absent', () => {
    setSearch('?volumes');
    expect(hasUrlGate('gpuTimings')).toBe(false);
  });

  it('tracks the live search string across changes', () => {
    setSearch('?debug=loading');
    expect(hasUrlGate('debug')).toBe(true);
    setSearch('');
    expect(hasUrlGate('debug')).toBe(false);
  });
});
