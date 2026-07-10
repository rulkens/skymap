/**
 * Tests for the five volume-settings clamp helpers.  Each helper is the
 * single source of truth for one knob's valid range; these tests pin the
 * pass-through, the floor clamp, the ceiling clamp, and the NaN/non-finite
 * fallback where applicable.
 */

import { describe, it, expect } from 'vitest';
import { clampVolumeContrast } from '../../src/utils/clampVolumeContrast';
import { clampVolumeDensityScale } from '../../src/utils/clampVolumeDensityScale';
import { clampVolumeExposure } from '../../src/utils/clampVolumeExposure';
import { clampVolumeTrim } from '../../src/utils/clampVolumeTrim';
import { clampVolumeIntensity } from '../../src/utils/clampVolumeIntensity';

describe('clampVolumeContrast clamps to [0.05, 16] and passes mid-range', () => {
  it('passes through a mid-range value unchanged', () => {
    expect(clampVolumeContrast(2)).toBe(2);
    expect(clampVolumeContrast(8)).toBe(8);
  });

  it('clamps above-ceiling values to 16', () => {
    expect(clampVolumeContrast(99)).toBe(16);
    expect(clampVolumeContrast(16.001)).toBe(16);
  });

  it('clamps below-floor values to 0.05', () => {
    expect(clampVolumeContrast(0)).toBe(0.05);
    expect(clampVolumeContrast(-5)).toBe(0.05);
    expect(clampVolumeContrast(0.04)).toBe(0.05);
  });
});

describe('clampVolumeDensityScale collapses non-positive / non-finite to 0', () => {
  it('passes through a positive finite value unchanged', () => {
    expect(clampVolumeDensityScale(2.5)).toBe(2.5);
    expect(clampVolumeDensityScale(0.001)).toBe(0.001);
    expect(clampVolumeDensityScale(1000)).toBe(1000);
  });

  it('collapses 0 to 0 (> 0 boundary)', () => {
    expect(clampVolumeDensityScale(0)).toBe(0);
  });

  it('collapses negative values to 0', () => {
    expect(clampVolumeDensityScale(-2)).toBe(0);
    expect(clampVolumeDensityScale(-0.001)).toBe(0);
  });

  it('collapses NaN to 0', () => {
    expect(clampVolumeDensityScale(NaN)).toBe(0);
  });

  it('collapses +Infinity to 0', () => {
    expect(clampVolumeDensityScale(Infinity)).toBe(0);
  });

  it('collapses -Infinity to 0', () => {
    expect(clampVolumeDensityScale(-Infinity)).toBe(0);
  });
});

describe('clampVolumeExposure clamps to [0, 32] and maps NaN to 1.0', () => {
  it('passes through a mid-range value unchanged', () => {
    expect(clampVolumeExposure(4)).toBe(4);
    expect(clampVolumeExposure(1)).toBe(1);
  });

  it('clamps above-ceiling values to 32', () => {
    expect(clampVolumeExposure(1000)).toBe(32);
    expect(clampVolumeExposure(32.1)).toBe(32);
  });

  it('clamps below-floor values to 0', () => {
    expect(clampVolumeExposure(-5)).toBe(0);
    expect(clampVolumeExposure(-0.001)).toBe(0);
  });

  it('maps NaN to 1.0', () => {
    expect(clampVolumeExposure(NaN)).toBe(1.0);
  });

  it('maps +Infinity to 1.0', () => {
    expect(clampVolumeExposure(Infinity)).toBe(1.0);
  });

  it('maps -Infinity to 1.0', () => {
    expect(clampVolumeExposure(-Infinity)).toBe(1.0);
  });
});

describe('clampVolumeTrim clamps to [0, 0.95] and maps NaN to 0.0', () => {
  it('passes through a mid-range value unchanged', () => {
    expect(clampVolumeTrim(0.3)).toBe(0.3);
    expect(clampVolumeTrim(0.5)).toBe(0.5);
  });

  it('clamps above-ceiling values to 0.95', () => {
    expect(clampVolumeTrim(2)).toBe(0.95);
    expect(clampVolumeTrim(0.96)).toBe(0.95);
  });

  it('clamps below-floor values to 0', () => {
    expect(clampVolumeTrim(-1)).toBe(0);
    expect(clampVolumeTrim(-0.001)).toBe(0);
  });

  it('maps NaN to 0.0', () => {
    expect(clampVolumeTrim(NaN)).toBe(0.0);
  });

  it('maps +Infinity to 0.0', () => {
    expect(clampVolumeTrim(Infinity)).toBe(0.0);
  });

  it('maps -Infinity to 0.0', () => {
    expect(clampVolumeTrim(-Infinity)).toBe(0.0);
  });
});

describe('clampVolumeIntensity clamps to [0, 1] and passes mid-range', () => {
  it('passes through a mid-range value unchanged', () => {
    expect(clampVolumeIntensity(0.5)).toBe(0.5);
    expect(clampVolumeIntensity(0.8)).toBe(0.8);
  });

  it('clamps above-ceiling values to 1', () => {
    expect(clampVolumeIntensity(5)).toBe(1);
    expect(clampVolumeIntensity(1.001)).toBe(1);
  });

  it('clamps below-floor values to 0', () => {
    expect(clampVolumeIntensity(-1)).toBe(0);
    expect(clampVolumeIntensity(-0.001)).toBe(0);
  });
});
