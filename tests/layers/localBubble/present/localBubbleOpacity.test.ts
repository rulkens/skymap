import { describe, it, expect } from 'vitest';

import { localBubbleOpacity } from '../../../../src/layers/localBubble/present/localBubbleOpacity';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

const KPC = SCALE_UNITS.KPC_TO_MPC;

describe('localBubbleOpacity', () => {
  it('is 0 inside 0.4 kpc, 1 between 1 and 4 kpc, 0 beyond 10 kpc', () => {
    expect(localBubbleOpacity(0.3 * KPC, 1, 1)).toBe(0);
    expect(localBubbleOpacity(2 * KPC, 1, 1)).toBe(1);
    expect(localBubbleOpacity(3 * KPC, 1, 1)).toBe(1);
    expect(localBubbleOpacity(12 * KPC, 1, 1)).toBe(0);
  });

  it('scales with intensity and fadeAlpha', () => {
    expect(localBubbleOpacity(2 * KPC, 0.5, 1)).toBeCloseTo(0.5);
    expect(localBubbleOpacity(2 * KPC, 1, 1.5)).toBeCloseTo(1.5);
    // intensity is clamped at 2 — a slider deep-link past the max must not blow it out.
    expect(localBubbleOpacity(2 * KPC, 1, 3)).toBeCloseTo(2);
  });
});
