import { describe, expect, it } from 'vitest';
import { traceHistogram } from '../../../../tools/mcpm-workbench/validate/traceHistogram';

describe('traceHistogram', () => {
  it('bins log1p(trace) into hand-computed bins, clamping negatives and overflow', () => {
    // binCount=4 over maxLogTrace=3 -> binWidth=0.75. Bin i covers
    // [i*0.75, (i+1)*0.75).
    //   -5  -> clamped to 0 -> log1p(0)=0        -> bin 0
    //    0  ->                 log1p(0)=0        -> bin 0
    //  e-1  ->                 log1p(e-1)=1      -> 1/0.75=1.33  -> bin 1
    //  100  ->                 log1p(100)≈4.615  -> overflow     -> bin 3 (clamped)
    const values = new Float64Array([-5, 0, Math.E - 1, 100]);

    const hist = traceHistogram(values, 4, 3);

    expect(Array.from(hist)).toEqual([2, 1, 0, 1]);
  });
});
