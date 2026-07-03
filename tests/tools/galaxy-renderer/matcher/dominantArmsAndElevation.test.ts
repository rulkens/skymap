/**
 * dominantArms + elevationFromQ — the two small reporting helpers on top of a
 * descriptor. dominantArms picks the strongest arm harmonic; elevationFromQ
 * turns an apparent axis ratio into a disk-inclination angle, refusing to tilt
 * ellipticals and irregulars and clamping the disk cases into [0.05, 1.45].
 */
import { describe, expect, it } from 'vitest';
import { dominantArms } from '../../../../tools/galaxy-renderer/src/matcher/dominantArms';
import { elevationFromQ } from '../../../../tools/galaxy-renderer/src/matcher/elevationFromQ';
import type { GalaxyDescriptor } from '../../../../tools/galaxy-renderer/@types/matcher/GalaxyDescriptor';

function descWithArm(arm: number[]): GalaxyDescriptor {
  return {
    q: 0.6,
    rHalf: 10,
    fluxFrac: new Float32Array(15),
    colorInner: 0,
    colorOuter: 0,
    arm: new Float32Array(arm),
    dustIdx: 0,
  };
}

describe('dominantArms', () => {
  it('returns the harmonic index with the largest magnitude', () => {
    expect(dominantArms(descWithArm([0.1, 0.05, 0.9, 0.2, 0.1, 0.0]))).toBe(3);
    expect(dominantArms(descWithArm([0.8, 0.1, 0.1, 0.1, 0.1, 0.1]))).toBe(1);
  });

  it('breaks ties toward the lowest harmonic (flat array → 1)', () => {
    // best/bv seed (2, -1) is overwritten by m=1 for any non-negative array,
    // so a flat spectrum resolves to the first harmonic, not the seed value.
    expect(dominantArms(descWithArm([0, 0, 0, 0, 0, 0]))).toBe(1);
  });
});

describe('elevationFromQ', () => {
  it('returns null for elliptical and irregular (never tilt)', () => {
    expect(elevationFromQ(0.5, 'elliptical')).toBeNull();
    expect(elevationFromQ(0.5, 'irregular')).toBeNull();
  });

  it('clamps q = 1 to the 1.45 ceiling', () => {
    expect(elevationFromQ(1, 'spiral')).toBeCloseTo(1.45, 10);
  });

  it('floors a tiny q at 0.05', () => {
    expect(elevationFromQ(0.001, 'barred')).toBeCloseTo(0.05, 3);
  });

  it('returns asin(q) for a mid-range disk', () => {
    expect(elevationFromQ(0.5, 'lenticular')).toBeCloseTo(Math.asin(0.5), 10);
  });
});
