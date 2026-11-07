import { describe, expect, it } from 'vitest';

import { STREAM_METALLICITY } from '../../../../tools/streams/data/streamMetallicity.constants';
import { streamMetallicity } from '../../../../tools/streams/utils/streamMetallicity';

describe('streamMetallicity', () => {
  it('a tabled stream gets its measured value and source', () => {
    expect(streamMetallicity('Pal5')).toEqual({ feh: -1.41, ref: 'Harris 2010' });
  });

  it('any other name, prototype keys included, gets the table median and no source', () => {
    const sorted = Object.values(STREAM_METALLICITY)
      .map((m) => m.feh)
      .sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median =
      sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    expect(streamMetallicity('GD-1')).toEqual({ feh: median, ref: null });
    expect(streamMetallicity('constructor')).toEqual({ feh: median, ref: null });
  });
});
