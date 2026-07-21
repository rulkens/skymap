import { describe, it, expect } from 'vitest';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';

describe('parseHashParams', () => {
  it('splits &-separated key=value pairs', () => {
    const m = parseHashParams('focus=a&t=b');
    expect([...m]).toEqual([
      ['focus', 'a'],
      ['t', 'b'],
    ]);
  });

  it('parses a single focus param as today', () => {
    const m = parseHashParams('focus=cluster-virgo-m87');
    expect([...m]).toEqual([['focus', 'cluster-virgo-m87']]);
  });

  it('returns an empty map for an empty body', () => {
    expect([...parseHashParams('')]).toEqual([]);
  });

  it('splits on the FIRST = only, so values may contain =', () => {
    const m = parseHashParams('t=2026-07-21T00:00:00Z&q=a=b=c');
    expect(m.get('t')).toBe('2026-07-21T00:00:00Z');
    expect(m.get('q')).toBe('a=b=c');
  });

  it('leaves raw (un-encoded) values untouched', () => {
    // No decodeURIComponent — a '+' stays a '+', not a space.
    expect(parseHashParams('focus=body-jupiter').get('focus')).toBe('body-jupiter');
  });
});
