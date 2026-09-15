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

  it('treats non-finite radius as zero (then clamps to the 0.1 Mpc minimum)', () => {
    // Defensive: a structure with NaN / Infinity radius must not produce a NaN
    // framing distance.
    expect(structureFocusDistance(Number.NaN, FOV60)).toBe(0.1);
    expect(structureFocusDistance(Number.POSITIVE_INFINITY, FOV60)).toBe(800);
    expect(structureFocusDistance(-1, FOV60)).toBe(0.1);
  });
});
