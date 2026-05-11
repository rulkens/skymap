import { describe, it, expect } from 'vitest';
import {
  VOLUME_FIELD_DEFAULTS,
  FALLBACK_VOLUME_DEFAULTS,
  NO_SPATIAL_ENVELOPE,
  getVolumeFieldDefaults,
} from '../../src/data/volumeFieldDefaults';

describe('volumeFieldDefaults', () => {
  it('exposes cf4-density with coolwarm + tuned contrast / densityScale', () => {
    const d = VOLUME_FIELD_DEFAULTS['cf4-density'];
    expect(d).toBeDefined();
    expect(d!.paletteId).toBe('coolwarm');
    // Values tuned visually against d_mean_CF4pp.npy — contrast 1.2
    // (a light ~17% deadband) suppresses near-mean noise without
    // cropping real structure; densityScale 20 compensates for the
    // visibility multiplier plus the spherical envelope's corner
    // cropping so the cloud reads at a useful saturation through
    // intensity=0.5.  Don't bump either without an A/B against the
    // CF-4 cube.
    expect(d!.contrast).toBeCloseTo(1.2, 6);
    expect(d!.densityScale).toBeCloseTo(20.0, 6);
  });

  it('debug fixtures default to identity contrast (no deadband)', () => {
    // Synthetic cubes don't have a noise floor worth windowing out;
    // identity contrast keeps the test patterns fully visible.
    for (const handle of ['debug-gaussian', 'debug-cartesian', 'debug-spherical']) {
      expect(VOLUME_FIELD_DEFAULTS[handle]!.contrast).toBeCloseTo(1.0, 6);
    }
  });

  it('fallback uses identity contrast', () => {
    expect(FALLBACK_VOLUME_DEFAULTS.contrast).toBeCloseTo(1.0, 6);
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

  it('cf4-density carries a spatial envelope that fades the cube corners', () => {
    // The CF-4 cube uses a soft skirt from the inscribed sphere
    // inward to hide the axis-aligned silhouette.  Inner < outer
    // means the shader will smoothstep between them; both finite and
    // <= √3 (the corner distance in normalised local space).
    const env = VOLUME_FIELD_DEFAULTS['cf4-density']!.envelope;
    expect(env.inner).toBeLessThan(env.outer);
    expect(env.outer).toBeLessThanOrEqual(Math.sqrt(3));
  });

  it('debug fixtures opt out of the envelope (NO_SPATIAL_ENVELOPE)', () => {
    // Synthetic cubes exist for axis / scale / origin verification —
    // hiding the corners would defeat the purpose.  The sentinel uses
    // inner === outer with both >= √3 so the smoothstep is pinned at
    // 1.0 throughout the cube.
    for (const handle of ['debug-gaussian', 'debug-cartesian', 'debug-spherical']) {
      const env = VOLUME_FIELD_DEFAULTS[handle]!.envelope;
      expect(env).toEqual(NO_SPATIAL_ENVELOPE);
      expect(env.inner).toBe(env.outer);
      expect(env.inner).toBeGreaterThanOrEqual(Math.sqrt(3));
    }
  });

  it('fallback also opts out of the envelope', () => {
    expect(FALLBACK_VOLUME_DEFAULTS.envelope).toEqual(NO_SPATIAL_ENVELOPE);
  });
});
