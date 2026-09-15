/**
 * Tests for clampVolumeFieldSettings — the read-edge clamp that keeps raw
 * Intent out of the GPU's volume shader uniforms.
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
});

describe('clampVolumeFieldSettings — bands', () => {
  it('falls back to [surveyDeepZoom] when bands is absent (stale persisted row)', () => {
    // A row persisted before `bands` existed has it absent at runtime despite
    // the type saying otherwise — the exact case the module header calls out.
    const stale = { ...rawHigh, bands: undefined } as unknown as VolumeFieldSettings;
    expect(clampVolumeFieldSettings(stale).bands).toEqual([SCALE_FADE_BANDS.surveyDeepZoom]);
  });
});
