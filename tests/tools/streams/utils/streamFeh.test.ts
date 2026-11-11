import { expect, it } from 'vitest';

import { STREAM_METALLICITY } from '../../../../tools/streams/data/streamMetallicity.constants';
import { streamFeh } from '../../../../tools/streams/utils/streamFeh';

it('a measured stream draws at its own [Fe/H], an unmeasured one at the table median', () => {
  const sorted = Object.values(STREAM_METALLICITY)
    .map((m) => m.feh)
    .sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median =
    sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  expect(streamFeh({ feh: -0.9, ref: 'x' })).toBe(-0.9);
  expect(streamFeh(null)).toBe(median);
});
