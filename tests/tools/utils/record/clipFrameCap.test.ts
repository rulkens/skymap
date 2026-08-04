import { describe, expect, it } from 'vitest';
import { clipFrameCap } from '../../../../tools/utils/record/clipFrameCap';
import { hold } from '../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

describe('clipFrameCap', () => {
  it('pads the compiled clip duration by the shared margin', () => {
    const fixture: ClipData = { timeline: [hold(8)] };

    // Hand-computed, NOT re-derived from the implementation's formula:
    //   compiled duration = 8 s (the single hold)
    //   cap = ceil((8 × 1.25 + 10) × 30) = ceil(600) = 600
    expect(clipFrameCap(fixture, 30)).toBe(600);
  });
});
