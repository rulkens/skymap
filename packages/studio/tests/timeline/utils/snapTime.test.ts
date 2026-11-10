import { describe, it, expect } from 'vitest';

import { snapTime } from '../../../src/timeline/utils/snapTime';

describe('snapTime', () => {
  const targets = [0, 4, 4.5, 10];

  it('snapTime snaps within 6 px to the nearest target and not beyond', () => {
    // 0.1 s per pixel: 6 px is 0.6 s.
    expect(snapTime(4.4, targets, 0.1)).toEqual({ sec: 4.5, snapped: 4.5 });
    expect(snapTime(3.5, targets, 0.1)).toEqual({ sec: 4, snapped: 4 });
    expect(snapTime(3.3, targets, 0.1)).toEqual({ sec: 3.3, snapped: null });
  });

  it('leaves the time alone with no targets', () => {
    expect(snapTime(2, [], 0.1)).toEqual({ sec: 2, snapped: null });
  });
});
