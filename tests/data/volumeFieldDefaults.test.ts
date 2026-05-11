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

  it('contrastCenter splits divergent (0.5) vs sequential (0.0) palettes', () => {
    // Divergent palettes (coolwarm) want the deadband centred on the
    // midpoint where the cosmic mean lives.
    expect(VOLUME_FIELD_DEFAULTS['cf4-density']!.contrastCenter).toBeCloseTo(0.5, 6);
    // Sequential palettes (inferno + log normalisation) want the
    // deadband centred on the void floor at LUT t=0 — otherwise the
    // contrast slider becomes a knife-edge and mid-density filaments
    // either disappear or wash out as solid colour.
    expect(VOLUME_FIELD_DEFAULTS['mcpm']!.contrastCenter).toBeCloseTo(0.0, 6);
    // Debug fixtures + fallback inherit the divergent default so the
    // pre-generalisation contrast behaviour is exactly preserved.
    expect(FALLBACK_VOLUME_DEFAULTS.contrastCenter).toBeCloseTo(0.5, 6);
    for (const handle of ['debug-gaussian', 'debug-cartesian', 'debug-spherical']) {
      expect(VOLUME_FIELD_DEFAULTS[handle]!.contrastCenter).toBeCloseTo(0.5, 6);
    }
  });

  it('exposes mcpm with inferno + windowed contrast for heavy-tailed trace density', () => {
    const d = VOLUME_FIELD_DEFAULTS['mcpm'];
    expect(d).toBeDefined();
    // Inferno (matplotlib perceptually-uniform) is the canonical
    // aesthetic for slime-mould / cosmic-web fire-on-black
    // visualisations (Polyphorm, MCPM tradition). Visually distinct
    // from CF-4's coolwarm (divergent cool/warm) so both overlays
    // can be enabled simultaneously and read as separate layers.
    expect(d!.paletteId).toBe('inferno');
    // MCPM trace densities are heavy-tailed (slime-mould agent density
    // spans decades); modest windowing brings filament structure forward
    // without crushing low-density voids.
    expect(d!.contrast).toBeCloseTo(1.5, 6);
    expect(d!.densityScale).toBeCloseTo(4.0, 6);
    expect(d!.label).toBe('MCPM Cosmic Web');
  });

  it('mcpm carries a soft spatial envelope', () => {
    const env = VOLUME_FIELD_DEFAULTS['mcpm']!.envelope;
    expect(env.inner).toBeLessThan(env.outer);
    expect(env.outer).toBeLessThanOrEqual(Math.sqrt(3));
  });

  it('mcpm gets a moderate trim default; CF-4 + debug fixtures get none', () => {
    expect(VOLUME_FIELD_DEFAULTS['mcpm']!.trim).toBeCloseTo(0.2, 6);
    expect(VOLUME_FIELD_DEFAULTS['cf4-density']!.trim).toBeCloseTo(0.0, 6);
    for (const handle of ['debug-gaussian', 'debug-cartesian', 'debug-spherical']) {
      expect(VOLUME_FIELD_DEFAULTS[handle]!.trim).toBeCloseTo(0.0, 6);
    }
    expect(FALLBACK_VOLUME_DEFAULTS.trim).toBeCloseTo(0.0, 6);
  });

  it('exposure boost: MCPM = 8 (peaks blow to white), others = 1 (no change)', () => {
    expect(VOLUME_FIELD_DEFAULTS['mcpm']!.exposure).toBeCloseTo(8.0, 6);
    expect(VOLUME_FIELD_DEFAULTS['cf4-density']!.exposure).toBeCloseTo(1.0, 6);
    for (const handle of ['debug-gaussian', 'debug-cartesian', 'debug-spherical']) {
      expect(VOLUME_FIELD_DEFAULTS[handle]!.exposure).toBeCloseTo(1.0, 6);
    }
    expect(FALLBACK_VOLUME_DEFAULTS.exposure).toBeCloseTo(1.0, 6);
  });
});
