import { describe, expect, it } from 'vitest';
import { nextDailyRun } from '../../src/utils/nextDailyRun.js';

describe('nextDailyRun', () => {
  it('today when the time is still ahead', () => {
    expect(nextDailyRun('03:30', new Date(2026, 10, 4, 1, 0))).toEqual(
      new Date(2026, 10, 4, 3, 30),
    );
  });

  it('tomorrow when it has passed', () => {
    expect(nextDailyRun('03:30', new Date(2026, 10, 4, 9, 0))).toEqual(
      new Date(2026, 10, 5, 3, 30),
    );
  });

  it('tomorrow when it is exactly now', () => {
    expect(nextDailyRun('03:30', new Date(2026, 10, 4, 3, 30))).toEqual(
      new Date(2026, 10, 5, 3, 30),
    );
  });
});
