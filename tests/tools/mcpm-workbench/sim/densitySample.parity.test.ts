/**
 * Pins histogram.wesl's density-sampling arithmetic that
 * histogramFlags.parity.test.ts does NOT cover (that file only pins the
 * HistogramFlags struct size + N_HISTOGRAM_BINS/HISTOGRAM_BASE). This pins
 * the two identities `meanLogTraceAtPoints` (TS, the one home for the
 * mean-log-trace statistic) relies on:
 *  1. the shader floors the continuous voxel coordinate BEFORE the i32
 *     cast, matching Math.floor's rounding on the (-1, 0) boundary — both
 *     dataPointHistogram.ts and histogram.wesl document this as load-bearing;
 *  2. the out-of-grid sentinel the shader writes (-1.0) is round-tripped
 *     through the real `meanLogTraceAtPoints` function, not just diffed as
 *     text, to confirm it is actually treated as "skip";
 *  3. the in-grid sampled-point counter (histogramCounts[N_HISTOGRAM_BINS],
 *     this project's own addition — the divisor `meanLogTraceAtPoints`
 *     takes as `sampledCount`) is only incremented AFTER the in-grid check.
 * The binning arithmetic itself (histoIndex's log-base HISTOGRAM_BASE
 * formula) is a separate, GPU-only visualization histogram this project's
 * statistic does not use -- not pinned here (see histogram.wesl vs
 * dataPointHistogram.ts's own, differently-binned `histogram` output).
 * Text-parsed per the R2 idiom (histogramFlags.parity.test.ts /
 * selectionEncoding), since WGSL and TS can't share code directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { meanLogTraceAtPoints } from '../../../../tools/mcpm-workbench/src/sim/meanLogTraceAtPoints';

const weslText = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/mcpm/histogram.wesl'),
  'utf-8',
);

describe('histogram.wesl density-sample arithmetic parity', () => {
  it('floors the continuous voxel coordinate before the i32 cast', () => {
    expect(weslText).toMatch(/vec3<i32>\(\s*floor\(\s*vec3<f32>\(x,\s*y,\s*z\)\s*\)\s*\)/);
  });

  it('out-of-grid sentinel is negative and meanLogTraceAtPoints treats it as skip', () => {
    const m = /densities\[idx\]\s*=\s*(-?[0-9.]+)\s*;\s*\n\s*return;/.exec(weslText);
    expect(m, 'out-of-grid sentinel assignment not found before the early return').toBeDefined();
    const sentinel = parseFloat(m![1]!);
    expect(sentinel).toBeLessThan(0);

    // Round-trip through the real function: a sentinel plus one real
    // in-grid sample (log1p(e-1) = 1), sampledCount=1 -> the sentinel must
    // not enter the sum or the divisor.
    expect(meanLogTraceAtPoints([sentinel, Math.E - 1], 1)).toBeCloseTo(1, 10);
  });

  it('the in-grid sampled-point counter is only incremented after the in-grid check', () => {
    const inGridCheckIndex = weslText.indexOf('if (!inGrid(voxel))');
    const counterIncrementIndex = weslText.indexOf(
      'atomicAdd(&histogramCounts[N_HISTOGRAM_BINS], 1u)',
    );
    expect(inGridCheckIndex).toBeGreaterThan(-1);
    expect(counterIncrementIndex).toBeGreaterThan(inGridCheckIndex);
  });
});
