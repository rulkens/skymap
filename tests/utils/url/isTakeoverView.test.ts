import { describe, it, expect } from 'vitest';
import { isTakeoverView } from '../../../src/utils/url/isTakeoverView';

describe('isTakeoverView', () => {
  it('is true for every takeover kind and false for place views', () => {
    for (const kind of ['tour', 'exhibit', 'clip', 'studio'] as const) {
      expect(isTakeoverView({ kind, id: 'x' })).toBe(true);
    }
    expect(isTakeoverView({ kind: 'home' })).toBe(false);
    expect(isTakeoverView({ kind: 'focus', id: 'ngc224' })).toBe(false);
  });
});
