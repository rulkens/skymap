import { describe, expect, it } from 'vitest';

import { sampleStreamBv } from '../../../../tools/streams/utils/sampleStreamBv';
import { splitmix64Rng } from '../../../../tools/utils/random/splitmix64Rng';

const N = 20_000;
const draws = (feh: number) => {
  const rng = splitmix64Rng(1n);
  return Array.from({ length: N }, () => sampleStreamBv(feh, rng));
};
// Bluer than any turnoff or giant colour of the model: only BHB draws fall below it.
const bhbShare = (bv: number[]) => bv.filter((v) => v < 0.3).length / bv.length;
const mean = (bv: number[]) => bv.reduce((s, v) => s + v, 0) / bv.length;

describe('sampleStreamBv', () => {
  it('a metal-poor stream has more BHB light and a bluer mean B−V than a metal-rich one', () => {
    const poor = draws(-2.2);
    const rich = draws(-0.7);
    expect(bhbShare(poor)).toBeGreaterThan(bhbShare(rich) + 0.05);
    expect(mean(poor)).toBeLessThan(mean(rich) - 0.2);
  });
});
