import { describe, it, expect } from 'vitest';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';

// The renderer's vertical FOV (wireInput.ts: 60°). Most assertions use it so
// the expected distances match what the live camera actually produces.
const FOV60 = (Math.PI / 180) * 60;

// Mirror of the helper's framing law for expectation building:
//   distance = R / (FOCUS_FILL · tan(fovY / 2)),  FOCUS_FILL = 2.2
// Kept here (not imported) so the test pins the contract independently.
const expectedDistance = (r: number, fovYRad: number): number => r / (2.2 * Math.tan(fovYRad / 2));

describe('structureFocusDistance', () => {
  it('scales the distance linearly with the apparent radius', () => {
    const small = structureFocusDistance(1, FOV60);
    const big = structureFocusDistance(4, FOV60);
    // 4× the radius → 4× the framing distance (both well inside the clamps).
    expect(big).toBeCloseTo(small * 4, 5);
  });

  it('frames closer as the field of view widens', () => {
    // A wider FOV fits the same on-screen overflow from nearer in.
    const narrow = structureFocusDistance(30, (Math.PI / 180) * 45);
    const wide = structureFocusDistance(30, (Math.PI / 180) * 75);
    expect(wide).toBeLessThan(narrow);
    expect(narrow).toBeCloseTo(expectedDistance(30, (Math.PI / 180) * 45), 5);
    expect(wide).toBeCloseTo(expectedDistance(30, (Math.PI / 180) * 75), 5);
  });

  it('clamps tiny structures up to the 0.1 Mpc minimum', () => {
    // A 0.05 Mpc apparent radius frames to ~0.035 Mpc → clamp up to 0.1 so
    // the target stays clear of the near plane.
    expect(structureFocusDistance(0.05, FOV60)).toBe(0.1);
  });

  it('clamps huge structures down to the 800 Mpc maximum', () => {
    // A 2000 Mpc apparent radius frames past 800 Mpc → clamp to 800 so the
    // framing stays inside the visible volume.
    expect(structureFocusDistance(2000, FOV60)).toBe(800);
  });

  it('treats non-finite radius as zero (then clamps to the 0.1 Mpc minimum)', () => {
    // Defensive: a structure with NaN / Infinity radius must not produce a NaN
    // framing distance.
    expect(structureFocusDistance(Number.NaN, FOV60)).toBe(0.1);
    expect(structureFocusDistance(Number.POSITIVE_INFINITY, FOV60)).toBe(800);
    expect(structureFocusDistance(-1, FOV60)).toBe(0.1);
  });
});
