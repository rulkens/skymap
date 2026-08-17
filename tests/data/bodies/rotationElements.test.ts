import { describe, it, expect } from 'vitest';
import {
  ROTATION_ELEMENTS,
  rotationById,
} from '../../../src/data/bodies/rotationElements';
import { SATURN_EQUATORIAL_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import { degToRad } from '../../../src/utils/math/degToRad';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('ROTATION_ELEMENTS', () => {
  it('has valid structure', () => {
    // The 15 textured bodies (spec §3) — a flat/emissive sphere carries none.
    expect(ROTATION_ELEMENTS).toHaveLength(15);

    // Ids are the lookup key, so a duplicate would silently shadow a body.
    const ids = ROTATION_ELEMENTS.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);

    // A declination outside ±90° is off the celestial sphere — a transcription
    // slip that no other check would catch (Uranus's legitimate −15.175° must
    // still pass; the sign is the IAU convention, not an error).
    for (const el of ROTATION_ELEMENTS) {
      expect(el.poleDecDeg).toBeGreaterThanOrEqual(-90);
      expect(el.poleDecDeg).toBeLessThanOrEqual(90);
    }
  });

  it("Saturn's rotation pole equals SATURN_EQUATORIAL_FRAME.normal", () => {
    // The rings and Saturn's regular moons ride one equatorial frame. That frame
    // is built from an IAU pole authored in orbitPlaneFrames.ts; this table
    // authors the same pole independently. Building the unit pole vector from
    // THIS table's α/δ and comparing to the frame normal proves the two authored
    // copies agree — a real cross-table contract (spec §4.1/§10), broken the day
    // one table is retuned without the other.
    const saturn = rotationById('saturn');
    const ra = degToRad(saturn.poleRaDeg);
    const dec = degToRad(saturn.poleDecDeg);
    const pole: Vec3 = [
      Math.cos(dec) * Math.cos(ra),
      Math.cos(dec) * Math.sin(ra),
      Math.sin(dec),
    ];

    expect(pole[0]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[0], 12);
    expect(pole[1]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[1], 12);
    expect(pole[2]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[2], 12);
  });
});
