/**
 * statsOf — rolls a flat `PerfSample[]` into one median+p90 stat per slot. The
 * expected medians and p90s are hand-computed against the type-7 definition
 * `percentile` uses (see its header), independent of `statsOf`'s own code, so a
 * regression in the rollup (wrong percentile, dropped slot, swapped median/p90)
 * fails here.
 */

import { describe, it, expect } from 'vitest';

import { statsOf } from '../../../../tools/utils/perf/statsOf';
import type { PerfSample } from '../../../../src/@types/perf/PerfSample';

describe('statsOf', () => {
  it('rolls a two-slot sample stream into per-slot median + p90', () => {
    // Interleaved so the rollup can't rely on samples arriving grouped. `frame`
    // is required on PerfSample but the per-slot rollup ignores it.
    const samples: PerfSample[] = [
      { slot: 'x', ms: 1, frame: 0 },
      { slot: 'y', ms: 10, frame: 0 },
      { slot: 'x', ms: 2, frame: 1 },
      { slot: 'x', ms: 3, frame: 2 },
      { slot: 'y', ms: 20, frame: 1 },
      { slot: 'x', ms: 4, frame: 3 },
      { slot: 'x', ms: 5, frame: 4 },
    ];

    const stats = statsOf(samples);
    const bySlot = new Map(stats.map((s) => [s.slot, s]));

    // x = [1,2,3,4,5]: p50 = 3; p90 = r=(0.9)(4)=3.6 → 4 + 0.6*(5-4) = 4.6
    expect(bySlot.get('x')?.median).toBeCloseTo(3, 6);
    expect(bySlot.get('x')?.p90).toBeCloseTo(4.6, 6);

    // y = [10,20]: p50 = r=0.5 → 10 + 0.5*10 = 15; p90 = r=0.9 → 10 + 0.9*10 = 19
    expect(bySlot.get('y')?.median).toBeCloseTo(15, 6);
    expect(bySlot.get('y')?.p90).toBeCloseTo(19, 6);
  });
});
