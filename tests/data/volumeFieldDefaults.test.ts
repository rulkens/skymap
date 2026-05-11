import { describe, it, expect } from 'vitest';
import {
  VOLUME_FIELD_DEFAULTS,
  FALLBACK_VOLUME_DEFAULTS,
  getVolumeFieldDefaults,
} from '../../src/data/volumeFieldDefaults';

describe('volumeFieldDefaults', () => {
  it('exposes cf4-density with coolwarm + densityScale 5.0', () => {
    const d = VOLUME_FIELD_DEFAULTS['cf4-density'];
    expect(d).toBeDefined();
    expect(d!.paletteId).toBe('coolwarm');
    expect(d!.densityScale).toBeCloseTo(5.0, 6);
  });

  it('exposes debug-gaussian with a sensible synthetic-Gaussian densityScale', () => {
    const d = VOLUME_FIELD_DEFAULTS['debug-gaussian'];
    expect(d).toBeDefined();
    expect(d!.densityScale).toBeGreaterThan(0);
  });

  it('returns the fallback for unknown handles', () => {
    expect(getVolumeFieldDefaults('not-a-real-field')).toEqual(FALLBACK_VOLUME_DEFAULTS);
  });

  it('fallback paletteId is one of the registered palettes', () => {
    expect([
      'viridis', 'magma', 'blue-purple', 'yellow-green', 'coolwarm',
    ]).toContain(FALLBACK_VOLUME_DEFAULTS.paletteId);
  });
});
