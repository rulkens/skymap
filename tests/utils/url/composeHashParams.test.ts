import { describe, it, expect } from 'vitest';
import { composeHashParams } from '../../../src/utils/url/composeHashParams';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';

describe('composeHashParams', () => {
  it('joins pairs in map insertion order', () => {
    const m = new Map([
      ['focus', 'body-jupiter'],
      ['t', '2026-07-21'],
    ]);
    expect(composeHashParams(m)).toBe('focus=body-jupiter&t=2026-07-21');
  });

  it('returns an empty string for an empty map', () => {
    expect(composeHashParams(new Map())).toBe('');
  });

  it('round-trips compose(parse(x)) === x for real hash bodies', () => {
    for (const body of ['focus=body-jupiter', 'focus=a&t=b', 'focus=cluster-virgo-m87', '']) {
      expect(composeHashParams(parseHashParams(body))).toBe(body);
    }
  });

  it('round-trips parse(compose(m)) deep-equals m', () => {
    const m = new Map([
      ['focus', 'body-jupiter'],
      ['t', '2026-07-21T00:00:00Z'],
    ]);
    expect([...parseHashParams(composeHashParams(m))]).toEqual([...m]);
  });
});
