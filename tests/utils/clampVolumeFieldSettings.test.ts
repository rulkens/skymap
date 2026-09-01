/**
 * Tests for clampVolumeFieldSettings — the read-edge clamp that keeps raw
 * Intent out of the GPU's volume shader uniforms.
 *
 * Each test asserts that the two non-numeric fields pass through unchanged
 * and that the input object is never mutated.
 */

import { describe, it, expect } from 'vitest';
import { clampVolumeFieldSettings } from '../../src/utils/clampVolumeFieldSettings';
import { SCALE_FADE_BANDS } from '../../src/services/engine/presentation/scaleFadeBands';
import type { VolumeFieldSettings } from '../../src/@types/settings/VolumeFieldSettings';

// Out-of-range raw values that force every scalar clamp to fire.
// intensity > 1 (clampVolumeIntensity ceiling is 1)
// contrast < 0.05 (clampVolumeContrast floor is 0.05)
// densityScale < 0 (clampVolumeDensityScale collapses to 0)
// trim > 0.95 (clampVolumeTrim ceiling is 0.95)
// exposure > 32 (clampVolumeExposure ceiling is 32)
const rawHigh: VolumeFieldSettings = {
  enabled: true,
  paletteId: 'magma',
  intensity: 5,
  contrast: 0.01,
  densityScale: -1,
  trim: 2,
  exposure: 100,
  bands: [SCALE_FADE_BANDS.surveyDeepZoom],
};

// A second variant: values below each floor so the low-side path is also hit.
// intensity < 0 (clampVolumeIntensity floor is 0)
// contrast > 16 (clampVolumeContrast ceiling is 16)
// densityScale = NaN (collapses to 0)
// trim < 0 (clampVolumeTrim floor is 0)
// exposure = NaN (maps to 1.0 neutral fallback)
const rawLow: VolumeFieldSettings = {
  enabled: false,
  paletteId: 'viridis',
  intensity: -3,
  contrast: 99,
  densityScale: NaN,
  trim: -0.5,
  exposure: NaN,
  bands: [SCALE_FADE_BANDS.milkyWayApproachSun],
};

describe('clampVolumeFieldSettings — paletteId and enabled pass through unchanged', () => {
  it('passes paletteId through without modification', () => {
    expect(clampVolumeFieldSettings(rawHigh).paletteId).toBe(rawHigh.paletteId);
    expect(clampVolumeFieldSettings(rawLow).paletteId).toBe(rawLow.paletteId);
  });

  it('passes enabled through without modification', () => {
    expect(clampVolumeFieldSettings(rawHigh).enabled).toBe(rawHigh.enabled);
    expect(clampVolumeFieldSettings(rawLow).enabled).toBe(rawLow.enabled);
  });
});

describe('clampVolumeFieldSettings — input object is not mutated', () => {
  it('leaves the raw input unchanged after clamping (high-side fixture)', () => {
    const before = { ...rawHigh };
    clampVolumeFieldSettings(rawHigh);
    expect(rawHigh.intensity).toBe(before.intensity);
    expect(rawHigh.contrast).toBe(before.contrast);
    expect(rawHigh.densityScale).toBe(before.densityScale);
    expect(rawHigh.trim).toBe(before.trim);
    expect(rawHigh.exposure).toBe(before.exposure);
  });

  it('leaves the raw input unchanged after clamping (low-side fixture)', () => {
    const before = { ...rawLow };
    clampVolumeFieldSettings(rawLow);
    expect(rawLow.intensity).toBe(before.intensity);
    expect(rawLow.contrast).toBe(before.contrast);
    // NaN !== NaN, so check via isNaN
    expect(Number.isNaN(rawLow.densityScale)).toBe(Number.isNaN(before.densityScale));
    expect(rawLow.trim).toBe(before.trim);
    expect(Number.isNaN(rawLow.exposure)).toBe(Number.isNaN(before.exposure));
  });
});

describe('clampVolumeFieldSettings — bands', () => {
  it('passes a present bands array through unchanged', () => {
    expect(clampVolumeFieldSettings(rawHigh).bands).toBe(rawHigh.bands);
    expect(clampVolumeFieldSettings(rawLow).bands).toBe(rawLow.bands);
  });

  it('falls back to [surveyDeepZoom] when bands is absent (stale persisted row)', () => {
    // A row persisted before `bands` existed has it absent at runtime despite
    // the type saying otherwise — the exact case the module header calls out.
    const stale = { ...rawHigh, bands: undefined } as unknown as VolumeFieldSettings;
    expect(clampVolumeFieldSettings(stale).bands).toEqual([SCALE_FADE_BANDS.surveyDeepZoom]);
  });
});
