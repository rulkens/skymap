import { describe, it, expect } from 'vitest';

import { shotOutName } from '../../../../tools/utils/shot/shotOutName';

// 2026-10-05 14:30:05 local time; component-wise construction keeps this timezone-stable.
const now = new Date(2026, 9, 5, 14, 30, 5);
const link = (hash: string) => ({ search: '', hash });
const name = (hash: string, taken: string[] = []) =>
  shotOutName({ link: link(hash), now, taken: new Set(taken) });

describe('shotOutName', () => {
  it('names the shot after its focus id', () => {
    expect(name('focus=body-saturn&t=1')).toBe('data/shots/body-saturn-20261005-143005.png');
  });
  it('falls back to exhibit, tour, clip in that order', () => {
    expect(name('clip=c&tour=t&exhibit=e')).toContain('/e-');
    expect(name('clip=c&tour=t')).toContain('/t-');
    expect(name('clip=c')).toContain('/c-');
  });
  it('uses "shot" when the hash names no subject', () => {
    expect(name('')).toBe('data/shots/shot-20261005-143005.png');
  });
  it('sanitises a subject with path characters', () => {
    expect(name('focus=a/b')).toBe('data/shots/a-b-20261005-143005.png');
  });
  it('suffixes a second shot of the same subject in one run', () => {
    const first = 'data/shots/body-saturn-20261005-143005.png';
    expect(name('focus=body-saturn', [first])).toBe('data/shots/body-saturn-20261005-143005-2.png');
    expect(name('focus=body-saturn', [first, 'data/shots/body-saturn-20261005-143005-2.png'])).toBe(
      'data/shots/body-saturn-20261005-143005-3.png',
    );
  });
});
