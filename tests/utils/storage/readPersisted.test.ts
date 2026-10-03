// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { readPersisted } from '../../../src/utils/storage/readPersisted';
import { SPLASH_SEEN_VERSION } from '../../../src/state/persistedValues';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readPersisted', () => {
  it('returns the parsed stored value', () => {
    window.localStorage.setItem(SPLASH_SEEN_VERSION.key, '1');
    expect(readPersisted(SPLASH_SEEN_VERSION)).toBe(1);
  });

  it('returns null when the key is absent', () => {
    expect(readPersisted(SPLASH_SEEN_VERSION)).toBeNull();
  });

  it('returns null for an unparsable value', () => {
    window.localStorage.setItem(SPLASH_SEEN_VERSION.key, 'notanumber');
    expect(readPersisted(SPLASH_SEEN_VERSION)).toBeNull();
  });

  it('returns null when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readPersisted(SPLASH_SEEN_VERSION)).toBeNull();
  });
});
