/**
 * antiquePlateTune — the defaults must reach the plate as identities (tint white, no
 * row hidden), or the look changes before anyone moves a knob; a switched-off row
 * sets its own `HIDE_*` bit (the bit order is pinned in antiqueLookRecords.parity).
 */

import { describe, expect, it } from 'vitest';
import { antiquePlateTune } from '../../../../src/utils/gpu/antiqueLook/antiquePlateTune';
import { ANTIQUE_TUNING_DEFAULTS } from '../../../../src/data/rendering/antiqueTuning';

describe('antiquePlateTune', () => {
  it('packs the defaults as the plate printed before the knobs existed', () => {
    expect(antiquePlateTune(ANTIQUE_TUNING_DEFAULTS)).toEqual({
      hatchUnits: 4.2,
      washGain: 1,
      inkGain: 1,
      lineInk: 0.6,
      borderWash: 0.6,
      tint: [1, 1, 1],
      hidden: 0,
    });
  });

  it('sets one bit per switched-off row', () => {
    const rows = { ...ANTIQUE_TUNING_DEFAULTS.rows, figures: false, relief: false };
    expect(antiquePlateTune({ ...ANTIQUE_TUNING_DEFAULTS, rows }).hidden).toBe(0b10000100);
  });
});
