/**
 * Tests for the volume-settings clamp helpers. Only the non-finite fallbacks
 * are pinned: they differ per knob (0, 1.0, 0.0) and are not inferable from
 * the range, where a wrong min/max bound is visible in the diff.
 */

import { describe, it, expect } from 'vitest';
import { clampVolumeDensityScale } from '../../src/utils/clampVolumeDensityScale';
import { clampVolumeExposure } from '../../src/utils/clampVolumeExposure';
import { clampVolumeTrim } from '../../src/utils/clampVolumeTrim';

describe('clampVolumeDensityScale collapses non-positive / non-finite to 0', () => {
  it('collapses NaN to 0', () => {
    expect(clampVolumeDensityScale(NaN)).toBe(0);
  });
});

describe('clampVolumeExposure clamps to [0, 32] and maps NaN to 1.0', () => {
  it('maps NaN to 1.0', () => {
    expect(clampVolumeExposure(NaN)).toBe(1.0);
  });
});

describe('clampVolumeTrim clamps to [0, 0.95] and maps NaN to 0.0', () => {
  it('maps NaN to 0.0', () => {
    expect(clampVolumeTrim(NaN)).toBe(0.0);
  });
});
