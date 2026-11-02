import { describe, expect, it } from 'vitest';

import { coveredFramingWindow } from '../../../src/utils/camera/coveredFramingWindow';
import { lensFramingWindow } from '../../../src/utils/camera/lensFramingWindow';
import { NO_INSETS_PX } from '../../../src/data/layout/noInsetsPx';

const FOV = Math.PI / 3;
const ASPECT = 0.4;
const HY = Math.tan(FOV / 2);
const HX = HY * ASPECT;

describe('coveredFramingWindow', () => {
  it('shrinks to the uncovered rect', () => {
    const w = coveredFramingWindow(FOV, ASPECT, { ...NO_INSETS_PX, bottom: 200 }, [400, 1000]);
    expect(w.tanHalfX).toBe(HX);
    expect(w.tanHalfY).toBeCloseTo(0.8 * HY, 12);
  });

  it('is the whole lens exactly with no covers, and keeps 40% under an oversized one', () => {
    expect(coveredFramingWindow(FOV, ASPECT, NO_INSETS_PX, [400, 1000])).toStrictEqual(
      lensFramingWindow(FOV, ASPECT),
    );
    const w = coveredFramingWindow(
      FOV,
      ASPECT,
      { ...NO_INSETS_PX, top: 900, bottom: 300 },
      [400, 1000],
    );
    expect(w.tanHalfY).toBeCloseTo(0.4 * HY, 12);
  });
});
