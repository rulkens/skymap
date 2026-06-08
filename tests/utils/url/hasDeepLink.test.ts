import { describe, it, expect } from 'vitest';
import { hasDeepLink } from '../../../src/utils/url/hasDeepLink';

describe('hasDeepLink', () => {
  it('returns false for empty hash and empty search', () => {
    expect(hasDeepLink({ hash: '', search: '' })).toBe(false);
  });

  it('detects #focus= for a galaxy in the hash', () => {
    expect(hasDeepLink({ hash: '#focus=ngc224', search: '' })).toBe(true);
  });

  it('detects #focus= for a structure in the hash', () => {
    // Structures (clusters, superclusters) ride #focus= since #poi= was dropped.
    expect(hasDeepLink({ hash: '#focus=cluster-virgo-m87', search: '' })).toBe(true);
  });

  it('#poi= is NOT a deep link — structures now use #focus=', () => {
    // #poi= has been removed; old links with this prefix do not suppress the splash.
    expect(hasDeepLink({ hash: '#poi=cluster-virgo-m87', search: '' })).toBe(false);
  });

  it('detects ?tour= in the search', () => {
    expect(hasDeepLink({ hash: '', search: '?tour=intro' })).toBe(true);
  });

  it('ignores power-user gates like ?debug, ?volumes, ?anchors', () => {
    expect(hasDeepLink({ hash: '', search: '?debug' })).toBe(false);
    expect(hasDeepLink({ hash: '', search: '?volumes' })).toBe(false);
    expect(hasDeepLink({ hash: '', search: '?anchors&gpuTimings' })).toBe(false);
  });

  it('returns true when both hash and search carry deep-link content', () => {
    expect(hasDeepLink({ hash: '#focus=ngc224', search: '?tour=intro' })).toBe(true);
  });

  it('handles leading-? and missing-? variants in the search string', () => {
    expect(hasDeepLink({ hash: '', search: 'tour=intro' })).toBe(true);
  });
});
