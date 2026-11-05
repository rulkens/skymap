import { describe, expect, it } from 'vitest';

import type { TraceEvent } from '../../../tools/phone/@types/TraceEvent';
import { summarizeFrames } from '../../../tools/phone/summarizeFrames';

const raf = (pid: number, ts: number, dur: number): TraceEvent => ({
  name: 'FireAnimationFrame',
  ph: 'X',
  pid,
  tid: 1,
  ts,
  dur,
});

describe('summarizeFrames', () => {
  it('reads the busiest rAF thread only, in time order, in ms', () => {
    // Out of order on purpose; pid 2 is another tab with fewer frames.
    const events = [
      raf(1, 32_000, 4000),
      raf(1, 0, 2000),
      raf(1, 16_000, 3000),
      raf(1, 50_000, 5000),
      raf(2, 1000, 90_000),
      raf(2, 2000, 90_000),
      { name: 'RunTask', ph: 'X', pid: 1, tid: 1, ts: 5, dur: 1 },
    ];
    expect(summarizeFrames(events)).toEqual({
      frames: 4,
      spanMs: 50,
      intervalMedianMs: 16,
      intervalP95Ms: 18,
      callbackMedianMs: 3,
      callbackP95Ms: 5,
    });
  });

  it('gives no summary for too few frames', () => {
    expect(summarizeFrames([raf(1, 0, 1), raf(1, 16_000, 1)])).toBeUndefined();
  });
});
