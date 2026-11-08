import { describe, expect, it } from 'vitest';

import { labelMaskRegions } from '../../../../tools/utils/image/labelMaskRegions';

describe('labelMaskRegions', () => {
  it('keeps two pixels touching only at a corner apart', () => {
    const { labels, count } = labelMaskRegions(Uint8Array.from([1, 0, 0, 1]), 2, 2);
    expect(count).toBe(2);
    expect(labels[0]).not.toBe(labels[3]);
    expect(labels[1]).toBe(-1);
  });

  it('never joins a row end to the next row start', () => {
    const { labels, count } = labelMaskRegions(Uint8Array.from([0, 0, 1, 1, 0, 0]), 3, 2);
    expect(count).toBe(2);
    expect(labels[2]).not.toBe(labels[3]);
  });
});
