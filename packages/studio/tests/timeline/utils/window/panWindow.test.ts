import { describe, expect, it } from 'vitest';
import { panWindow } from '../../../../src/timeline/utils/window/panWindow';

const FIT = { startSec: 0, endSec: 120 };

describe('panWindow', () => {
  it('shifts the window by the given seconds and stops at either end of the clip', () => {
    expect(panWindow({ startSec: 20, endSec: 40 }, FIT, 5)).toEqual({ startSec: 25, endSec: 45 });
    expect(panWindow({ startSec: 20, endSec: 40 }, FIT, -50)).toEqual({ startSec: 0, endSec: 20 });
    expect(panWindow({ startSec: 20, endSec: 40 }, FIT, 500)).toEqual({
      startSec: 100,
      endSec: 120,
    });
  });
});
