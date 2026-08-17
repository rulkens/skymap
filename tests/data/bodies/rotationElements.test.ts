import { describe, it, expect } from 'vitest';
import { ROTATION_ELEMENTS, rotationById } from '../../../src/data/bodies/rotationElements';
import { SATURN_EQUATORIAL_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
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
    const pole: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];

    expect(pole[0]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[0], 12);
    expect(pole[1]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[1], 12);
    expect(pole[2]).toBeCloseTo(SATURN_EQUATORIAL_FRAME.normal[2], 12);
  });

  it("Charon's spin rate equals 360° / its own orbital period (mutual tidal lock)", () => {
    // The other cross-table contract, and the one Charon's row comment declares:
    // Pluto and Charon are MUTUALLY locked, so Charon's rotation period and its
    // orbital period are one physical quantity measured two ways — spin from
    // WGCCRE, period from JPL's Pluto-satellite page. Editing one alone silently
    // unlocks the pair, and the render (a face that slowly turns away over
    // enough sim time) is the only other place it would show.
    //
    // The period comes back out of the row's stored rate rather than being
    // restated: `satellite`/`moonRatesFromPeriods` folded JPL's P into
    // dM/dt = 2π · 36525 / P, so this inverts that and never hard-codes 6.387222.
    const charon = elementsById('charon');
    const orbitalPeriodDays = (2 * Math.PI * 36_525) / charon.meanAnomalyRateRadPerCty!;

    // Tolerance from the two constants' published precision, not from taste.
    // d(360/P)/dP = 360/P² = 8.8 °/day per day of P, so P's last published place
    // (1e-6 d) is worth 8.8e-6 °/day — and the residual between the two
    // independently rounded numbers is exactly one such place, 8.8e-6. The bound
    // sits just above it: any edit that moves P beyond its published rounding
    // trips this, while the rounding itself does not.
    expect(
      Math.abs(rotationById('charon').spinRateDegPerDay - 360 / orbitalPeriodDays),
    ).toBeLessThan(2e-5);
  });
});
