import { describe, it, expect } from 'vitest';
import { poiFocusDistance } from '../../../../src/services/engine/camera/poiFocusDistance';

// The renderer's vertical FOV (wireInput.ts: 60°). Most assertions use it so
// the expected distances match what the live camera actually produces.
const FOV60 = (Math.PI / 180) * 60;

// Mirror of the helper's framing law for expectation building:
//   distance = R / (FOCUS_FILL · tan(fovY / 2)),  FOCUS_FILL = 2.5
// Kept here (not imported) so the test pins the contract independently.
const expectedDistance = (r: number, fovYRad: number): number => r / (2.5 * Math.tan(fovYRad / 2));

describe('poiFocusDistance', () => {
  it('frames the apparent radius to a fixed screen-fill fraction', () => {
    // Virgo apparent radius ~6 Mpc at 60° FOV → ~4.16 Mpc framing (ring
    // overflows the viewport ~2.5:1, just past the close-approach fade).
    expect(poiFocusDistance('cluster', 6, FOV60)).toBeCloseTo(expectedDistance(6, FOV60), 5);
  });

  it('scales the distance linearly with the apparent radius', () => {
    const small = poiFocusDistance('group', 1, FOV60);
    const big = poiFocusDistance('group', 4, FOV60);
    // 4× the radius → 4× the framing distance (both well inside the clamps).
    expect(big).toBeCloseTo(small * 4, 5);
  });

  it('frames closer as the field of view widens', () => {
    // A wider FOV fits the same on-screen overflow from nearer in.
    const narrow = poiFocusDistance('supercluster', 30, (Math.PI / 180) * 45);
    const wide = poiFocusDistance('supercluster', 30, (Math.PI / 180) * 75);
    expect(wide).toBeLessThan(narrow);
    expect(narrow).toBeCloseTo(expectedDistance(30, (Math.PI / 180) * 45), 5);
    expect(wide).toBeCloseTo(expectedDistance(30, (Math.PI / 180) * 75), 5);
  });

  it('clamps tiny POIs up to the 0.1 Mpc minimum', () => {
    // A 0.05 Mpc apparent radius frames to ~0.035 Mpc → clamp up to 0.1 so
    // the target stays clear of the near plane.
    expect(poiFocusDistance('group', 0.05, FOV60)).toBe(0.1);
  });

  it('clamps huge POIs down to the 800 Mpc maximum', () => {
    // A 2000 Mpc apparent radius frames past 800 Mpc → clamp to 800 so the
    // framing stays inside the visible volume.
    expect(poiFocusDistance('supercluster', 2000, FOV60)).toBe(800);
  });

  it('treats non-finite radius as zero (then clamps to the 0.1 Mpc minimum)', () => {
    // Defensive: a POI with NaN / Infinity radius must not produce a NaN
    // framing distance.
    expect(poiFocusDistance('cluster', Number.NaN, FOV60)).toBe(0.1);
    expect(poiFocusDistance('cluster', Number.POSITIVE_INFINITY, FOV60)).toBe(800);
    expect(poiFocusDistance('cluster', -1, FOV60)).toBe(0.1);
  });

  it('throws for famousGalaxy (wrong framing path)', () => {
    expect(() => poiFocusDistance('famousGalaxy', 1, FOV60)).toThrow(/famousGalaxy/);
  });
});
