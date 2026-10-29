import { describe, it, expect } from 'vitest';
import { ROTATION_ELEMENTS, rotationRowById } from '../../../src/data/bodies/rotationElements';
import { SATURN_EQUATORIAL_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { BODY_TEXTURE_REGISTRY } from '../../../src/data/bodies/bodyTextureRegistry';
import { degToRad } from '../../../src/utils/math/degToRad';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('ROTATION_ELEMENTS', () => {
  it('has valid structure', () => {
    // Ids are the lookup key, so a duplicate would silently shadow a body.
    const ids = ROTATION_ELEMENTS.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);

    // A declination outside ±90° is off the celestial sphere — a transcription
    // slip that no other check would catch (Uranus's legitimate −15.175° must
    // still pass; the sign is the IAU convention, not an error).
    for (const el of ROTATION_ELEMENTS) {
      if (!('poleDecDeg' in el)) continue; // the aimed arms carry no pole
      expect(el.poleDecDeg).toBeGreaterThanOrEqual(-90);
      expect(el.poleDecDeg).toBeLessThanOrEqual(90);
    }
  });

  it('every textured body keeps its rotation row', () => {
    // A row without one falls back to IDENTITY_MAT3: the texture would turn with the
    // ecliptic frame and its prime meridian would be wrong, silently.
    for (const spec of Object.values(BODY_TEXTURE_REGISTRY)) {
      expect(rotationRowById(spec.bodyId), spec.bodyId).not.toBeNull();
    }
  });

  it("Saturn's rotation pole equals SATURN_EQUATORIAL_FRAME.normal", () => {
    // The same IAU pole is authored independently in orbitPlaneFrames.ts and here; retuning one alone breaks it.
    const saturn = rotationRowById('saturn')!;
    if (!('poleRaDeg' in saturn)) throw new Error('saturn must be an IAU-pole row');
    const ra = degToRad(saturn.poleRaDeg);
    const dec = degToRad(saturn.poleDecDeg);
    const pole: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];

    expect(pole[0]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[0], 12);
    expect(pole[1]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[1], 12);
    expect(pole[2]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[2], 12);
  });

  it("Charon's spin rate equals 360° / its own orbital period (mutual tidal lock)", () => {
    // Spin (WGCCRE) and period (JPL) are one quantity measured twice; editing one alone silently
    // unlocks the pair. Inverts dM/dt = 2π · 36525 / P (`moonRatesFromPeriods`) rather than restating P.
    const charon = elementsById('charon');
    const orbitalPeriodDays = (2 * Math.PI * 36_525) / charon.meanAnomalyRateRadPerCty!;
    const charonRotation = rotationRowById('charon')!;
    if (!('spinRateDegPerDay' in charonRotation)) throw new Error('charon must be an IAU-pole row');

    // d(360/P)/dP = 8.8 °/day per day, so P's last published place (1e-6 d) is 8.8e-6 °/day,
    // exactly the rounding residual; 2e-5 sits just above it.
    expect(Math.abs(charonRotation.spinRateDegPerDay - 360 / orbitalPeriodDays)).toBeLessThan(2e-5);
  });
});
