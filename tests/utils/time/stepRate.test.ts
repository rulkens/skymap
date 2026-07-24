import { describe, expect, it } from 'vitest';
import { stepRate } from '../../../src/utils/time/stepRate';
import { RATE_LADDER } from '../../../src/data/time/rateLadder';
import type { RootState } from '../../../src/store/types';

/**
 * A RootState carrying only what `selectTimeState` reads — the `time` slice's
 * `rateIndex`. `stepRate` is pure, so no store is needed.
 */
const rootWithRateIndex = (rateIndex: number): RootState =>
  ({ time: { rateIndex } }) as unknown as RootState;

describe('stepRate', () => {
  it('clamps at the slow end', () => {
    expect(stepRate(rootWithRateIndex(0), -1)).toBe(0);
  });

  it('clamps at the fast end', () => {
    const last = RATE_LADDER.length - 1;
    expect(stepRate(rootWithRateIndex(last), 1)).toBe(last);
  });

  it('steps one detent', () => {
    const mid = Math.floor((RATE_LADDER.length - 1) / 2);
    expect(stepRate(rootWithRateIndex(mid), 1)).toBe(mid + 1);
  });
});
