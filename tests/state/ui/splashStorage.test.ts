// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SPLASH_STORAGE_KEY,
  CURRENT_SPLASH_VERSION,
  readSeenVersion,
  writeSeenVersion,
} from '../../../src/state/ui/splashStorage';

describe('splashStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('readSeenVersion', () => {
    it('returns null when the key is absent', () => {
      expect(readSeenVersion()).toBeNull();
    });

    it('returns the stored integer when the key is present', () => {
      window.localStorage.setItem(SPLASH_STORAGE_KEY, '1');
      expect(readSeenVersion()).toBe(1);
    });

    it('returns null on a non-integer value', () => {
      window.localStorage.setItem(SPLASH_STORAGE_KEY, 'notanumber');
      expect(readSeenVersion()).toBeNull();
    });
  });

  describe('writeSeenVersion', () => {
    it('writes String(version) to the storage key', () => {
      writeSeenVersion(2);
      expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe('2');
    });

    it('writes the current version constant without coercion loss', () => {
      writeSeenVersion(CURRENT_SPLASH_VERSION);
      expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(String(CURRENT_SPLASH_VERSION));
    });
  });
});
