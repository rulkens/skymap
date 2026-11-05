import { describe, expect, it } from 'vitest';
import { countAtOrBefore } from '../../../src/utils/math/countAtOrBefore';

describe('countAtOrBefore', () => {
  const t = Float64Array.of(10, 20, 30, 40);

  it('counts the entries at or before x, ties included', () => {
    expect(countAtOrBefore(t, 5)).toBe(0);
    expect(countAtOrBefore(t, 10)).toBe(1);
    expect(countAtOrBefore(t, 25)).toBe(2);
    expect(countAtOrBefore(t, 30)).toBe(3);
    expect(countAtOrBefore(t, 40)).toBe(4);
    expect(countAtOrBefore(t, 1e9)).toBe(4);
  });
});
