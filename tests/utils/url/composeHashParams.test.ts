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

  it('round-trips compose(parse(x)) === x for real hash bodies', () => {
    for (const body of ['focus=body-jupiter', 'focus=a&t=b', 'focus=cluster-virgo-m87', '']) {
      expect(composeHashParams(parseHashParams(body))).toBe(body);
    }
  });
});
