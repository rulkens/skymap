import { describe, it, expect } from 'vitest';
import { getVolumeFieldDefaults } from '../../../src/data/volume/volumeFieldDefaults';
import type { VolumeFieldId } from '../../../src/@types/data/volume/VolumeFieldId';

const DEBUG_IDS: ReadonlyArray<VolumeFieldId> = [
  'debug-gaussian',
  'debug-cartesian',
  'debug-spherical',
];

describe('volumeFieldDefaults', () => {
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

  it('mcpm carries a soft spatial envelope', () => {
    const env = getVolumeFieldDefaults('mcpm').envelope;
    expect(env.inner).toBeLessThan(env.outer);
    expect(env.outer).toBeLessThanOrEqual(Math.sqrt(3));
  });
});
