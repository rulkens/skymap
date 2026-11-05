import { describe, expect, it } from 'vitest';

import { coverShiftNdc } from '../../../../../../src/services/engine/camera/lens/utils/coverShiftNdc';
import { NO_INSETS_PX } from '../../../../../../src/data/layout/noInsetsPx';

describe('coverShiftNdc', () => {
  it('lifts the axis above a bottom cover', () => {
    const [cx, cy] = coverShiftNdc({ ...NO_INSETS_PX, bottom: 200 }, [400, 1000]);
    expect(cx).toBe(0);
    expect(cy).toBeCloseTo(0.2, 12);
  });

  it('moves the axis left of a right sidebar', () => {
    expect(coverShiftNdc({ ...NO_INSETS_PX, right: 400 }, [1600, 900])).toEqual([-0.25, 0]);
  });

  it('clamps a cover wider than the window', () => {
    expect(coverShiftNdc({ ...NO_INSETS_PX, right: 1000 }, [1000, 800])[0]).toBeCloseTo(-0.6, 12);
  });
});
