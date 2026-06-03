/**
 * Volume params — the single-slider spec must agree with the slice default.
 *
 * The volume layer exposes exactly one live control (intensity); dMax and alpha
 * are fixed defaults on the slice, not sliders. So the spec array has length 1,
 * and the slice's default intensity must sit inside that slider's range
 * (otherwise the UI would render a thumb off the track on first paint).
 */
import { describe, expect, it } from 'vitest';
import { VOLUME_PARAM_SPECS } from '../../../../tools/cosmic-flow/src/visualizations/densityVolume/params';
import { defaultVolumeSlice } from '../../../../tools/cosmic-flow/src/state/slices/volumeSlice';

describe('volume params', () => {
  it('VOLUME_PARAM_SPECS exposes only the intensity slider', () => {
    expect(VOLUME_PARAM_SPECS).toHaveLength(1);
    expect(VOLUME_PARAM_SPECS[0]?.id).toBe('intensity');
  });

  it('volume intensity default (10) sits within the intensity spec range (1..40)', () => {
    const intensity = VOLUME_PARAM_SPECS.find((s) => s.id === 'intensity');
    expect(intensity).toBeDefined();
    expect(defaultVolumeSlice.intensity).toBeGreaterThanOrEqual(intensity!.min);
    expect(defaultVolumeSlice.intensity).toBeLessThanOrEqual(intensity!.max);
  });
});
