import { describe, expect, it } from 'vitest';
import { reloadDelayAfter } from '../../../../src/main/windows/utils/reloadDelayAfter';

describe('reloadDelayAfter', () => {
  it('doubles while a window keeps crashing, up to a minute', () => {
    const delays: number[] = [];
    let last: number | null = null;
    for (let i = 0; i < 8; i++) delays.push((last = reloadDelayAfter(last, 3000)));
    expect(delays).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
  });

  it('starts over once the window stayed up a minute', () => {
    expect(reloadDelayAfter(60000, 61_000)).toBe(2000);
  });
});
