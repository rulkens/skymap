import { describe, it, expect } from 'vitest';
import { lineSchedule } from '../../../src/utils/animation/lineSchedule';
import { SUBTITLE_MIN_CHARS } from '../../../src/data/animation/subtitleTiming';

const len = (n: number) => 'x'.repeat(n);
const span = (s: { startSec: number; endSec: number }) => s.endSec - s.startSec;

describe('lineSchedule', () => {
  it('slices are contiguous from 0 to dwellSec', () => {
    const s = lineSchedule([len(30), len(50), len(20)], 12);
    expect(s[0]!.startSec).toBe(0);
    for (let i = 0; i < s.length - 1; i++) expect(s[i]!.endSec).toBe(s[i + 1]!.startSec);
    expect(s[s.length - 1]!.endSec).toBe(12);
  });

  it('a longer line gets a longer slice', () => {
    const s = lineSchedule([len(20), len(80)], 10);
    expect(span(s[1]!) / span(s[0]!)).toBeCloseTo(4);
  });

  it('the weight floor lifts a very short line', () => {
    const short = lineSchedule(['OK.', len(40)], 10)[0]!;
    const floored = lineSchedule([len(SUBTITLE_MIN_CHARS), len(40)], 10)[0]!;
    expect(span(short)).toBeCloseTo(span(floored));
  });

  it('one line spans the whole dwell', () => {
    expect(lineSchedule([len(30)], 9)).toEqual([{ startSec: 0, endSec: 9 }]);
  });
});
