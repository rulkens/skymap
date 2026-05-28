import { describe, it, expect } from 'vitest';
import { getVolumeFieldDefaults } from '../../src/data/volumeFieldDefaults';
import type { VolumeFieldId } from '../../src/@types/data/VolumeFieldId';

const DEBUG_IDS: ReadonlyArray<VolumeFieldId> = [
  'debug-gaussian',
  'debug-cartesian',
  'debug-spherical',
];

describe('volumeFieldDefaults', () => {
  it('exposes cf4-density with coolwarm + tuned contrast / densityScale', () => {
    const d = getVolumeFieldDefaults('cf4-density');
    // Values tuned visually against d_mean_CF4pp.npy — contrast 1.2
    // (a light ~17% deadband) suppresses near-mean noise without
    // cropping real structure; densityScale 20 compensates for the
    // visibility multiplier plus the spherical envelope's corner
    // cropping so the cloud reads at a useful saturation through
    // intensity=0.5.  Don't bump either without an A/B against the
    // CF-4 cube.
    expect(d.paletteId).toBe('coolwarm');
    expect(d.contrast).toBeCloseTo(1.2, 6);
    expect(d.densityScale).toBeCloseTo(20.0, 6);
  });

  it('debug fixtures default to identity contrast (no deadband)', () => {
    // Synthetic cubes don't have a noise floor worth windowing out;
    // identity contrast keeps the test patterns fully visible.
    for (const id of DEBUG_IDS) {
      expect(getVolumeFieldDefaults(id).contrast).toBeCloseTo(1.0, 6);
    }
  });

  it('debug-gaussian has a sensible synthetic-Gaussian densityScale', () => {
    expect(getVolumeFieldDefaults('debug-gaussian').densityScale).toBeGreaterThan(0);
  });

  it('cf4-density carries a spatial envelope that fades the cube corners', () => {
    // The CF-4 cube uses a soft skirt from the inscribed sphere
    // inward to hide the axis-aligned silhouette.  Inner < outer
    // means the shader will smoothstep between them; both finite and
    // <= √3 (the corner distance in normalised local space).
    const env = getVolumeFieldDefaults('cf4-density').envelope;
    expect(env.inner).toBeLessThan(env.outer);
    expect(env.outer).toBeLessThanOrEqual(Math.sqrt(3));
  });

  it('debug fixtures opt out of the envelope (degenerate smoothstep)', () => {
    // Synthetic cubes exist for axis / scale / origin verification —
    // hiding the corners would defeat the purpose.  Equal `inner` and
    // `outer` with both >= √3 pins the smoothstep at 1.0 throughout.
    for (const id of DEBUG_IDS) {
      const env = getVolumeFieldDefaults(id).envelope;
      expect(env.inner).toBe(env.outer);
      expect(env.inner).toBeGreaterThanOrEqual(Math.sqrt(3));
    }
  });

  it('contrastCenter splits divergent (0.5) vs sequential (0.0) palettes', () => {
    // Divergent palettes (coolwarm) want the deadband centred on the
    // midpoint where the cosmic mean lives.
    expect(getVolumeFieldDefaults('cf4-density').contrastCenter).toBeCloseTo(0.5, 6);
    // Sequential palettes (inferno + log normalisation) want the
    // deadband centred on the void floor at LUT t=0 — otherwise the
    // contrast slider becomes a knife-edge and mid-density filaments
    // either disappear or wash out as solid colour.
    expect(getVolumeFieldDefaults('mcpm').contrastCenter).toBeCloseTo(0.0, 6);
    for (const id of DEBUG_IDS) {
      expect(getVolumeFieldDefaults(id).contrastCenter).toBeCloseTo(0.5, 6);
    }
  });

  it('exposes mcpm with inferno + windowed contrast for heavy-tailed trace density', () => {
    const d = getVolumeFieldDefaults('mcpm');
    // Inferno (matplotlib perceptually-uniform) is the canonical
    // aesthetic for slime-mould / cosmic-web fire-on-black
    // visualisations (Polyphorm, MCPM tradition). Visually distinct
    // from CF-4's coolwarm so both overlays can be enabled
    // simultaneously and read as separate layers.
    expect(d.paletteId).toBe('inferno');
    // MCPM trace densities are heavy-tailed (slime-mould agent density
    // spans decades); modest windowing brings filament structure forward
    // without crushing low-density voids.
    expect(d.contrast).toBeCloseTo(1.7, 6);
    expect(d.densityScale).toBeCloseTo(18.0, 6);
    expect(d.label).toBe('MCPM Cosmic Web');
  });

  it('mcpm carries a soft spatial envelope', () => {
    const env = getVolumeFieldDefaults('mcpm').envelope;
    expect(env.inner).toBeLessThan(env.outer);
    expect(env.outer).toBeLessThanOrEqual(Math.sqrt(3));
  });

  it('mcpm gets a moderate trim default; CF-4 + debug fixtures get none', () => {
    expect(getVolumeFieldDefaults('mcpm').trim).toBeCloseTo(0.3, 6);
    expect(getVolumeFieldDefaults('cf4-density').trim).toBeCloseTo(0.0, 6);
    for (const id of DEBUG_IDS) {
      expect(getVolumeFieldDefaults(id).trim).toBeCloseTo(0.0, 6);
    }
  });

  it('per-cube intensity: every production volume carries explicit intensity; debug fixtures omit', () => {
    expect(getVolumeFieldDefaults('mcpm').intensity).toBeCloseTo(1.0, 6);
    expect(getVolumeFieldDefaults('cf4-density').intensity).toBeCloseTo(0.5, 6);
    for (const id of DEBUG_IDS) {
      expect(getVolumeFieldDefaults(id).intensity).toBeUndefined();
    }
  });

  it('exposure boost: MCPM = 18 (peaks blow to white), others = 1 (no change)', () => {
    expect(getVolumeFieldDefaults('mcpm').exposure).toBeCloseTo(18.0, 6);
    expect(getVolumeFieldDefaults('cf4-density').exposure).toBeCloseTo(1.0, 6);
    for (const id of DEBUG_IDS) {
      expect(getVolumeFieldDefaults(id).exposure).toBeCloseTo(1.0, 6);
    }
  });
});
