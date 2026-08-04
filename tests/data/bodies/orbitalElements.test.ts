import { describe, it, expect } from 'vitest';
import { ORBITAL_ELEMENTS, elementsById } from '../../../src/data/bodies/orbitalElements';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { propagateElements } from '../../../src/utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * Invariants only (per testing.md). The seeded element VALUES are verified
 * against JPL in the spec, not re-asserted here — a value restatement would
 * only mirror the source. What CAN break silently is the table's structure:
 * a duplicate id, a dangling focusId, or an out-of-range element that the
 * Keplerian math downstream would consume as garbage. Those are pinned.
 */
describe('ORBITAL_ELEMENTS has a valid structure', () => {
  it('gives every body a unique id', () => {
    const ids = ORBITAL_ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every focusId to a real body', () => {
    // A focus is either another orbit in this table, the Sun (a seeded scene
    // body), or another seeded scene body (the Moon orbits Earth). A dangling
    // focusId would leave a trail orbiting nothing.
    const known = new Set<string>([
      ...ORBITAL_ELEMENTS.map((e) => e.id),
      ...SCENE_BODIES.map((b) => b.id),
    ]);
    for (const e of ORBITAL_ELEMENTS) {
      expect(known.has(e.focusId)).toBe(true);
    }
  });

  it('every orbital element row names a focus', () => {
    // `focusId` has no null case any more — an empty string would silently
    // resolve to nothing in `deriveBodyStates`'s map lookup.
    for (const e of ORBITAL_ELEMENTS) {
      expect(e.focusId.length).toBeGreaterThan(0);
    }
  });

  it('keeps every eccentricity in the bound orbit range [0, 1)', () => {
    // e < 1 is what makes the conic an ellipse; e = 1 (parabola) or e > 1
    // (hyperbola) would break the unit-circle parameterisation the trail rests
    // on and the a(1 − e) periapsis magnitude.
    for (const e of ORBITAL_ELEMENTS) {
      expect(e.eccentricity).toBeGreaterThanOrEqual(0);
      expect(e.eccentricity).toBeLessThan(1);
    }
  });

  it('gives every orbit a positive semi-major axis', () => {
    for (const e of ORBITAL_ELEMENTS) {
      expect(e.semiMajorMpc).toBeGreaterThan(0);
    }
  });
});

describe('the Moon row propagated against reality', () => {
  it('aligns the Moon with the Sun at a real solar eclipse (2024-04-08)', () => {
    // External contract, and the only test that constrains the Moon's mean-
    // longitude RATE against the real sky — the epoch-value checks above and
    // the propagation-algebra tests cannot see a rate transcribed from the
    // wrong period column.
    //
    // Reference instant: greatest eclipse of the 2024-04-08 total solar
    // eclipse, 18:18 UT ⇒ JD 2460409.2625 (NASA eclipse catalog). At that
    // moment the geocentric Moon stands almost exactly between Earth and Sun,
    // so the Sun–Earth–Moon angle is ≈ 0 — and an angle between two directions
    // is frame-invariant, so the test never touches the ecliptic→equatorial
    // rotation.
    //
    // Tolerance: the mean-ellipse Moon (no evection ±1.27°, no variation
    // ±0.66°) reproduces this alignment to ~1.2°; that residual is the model's
    // honest floor, so 2° passes it with margin. The bug class this gate
    // exists to catch is a wrong mean-longitude rate: reading JPL's sidereal
    // month as the anomalistic (mean-anomaly) period double-counts the apsidal
    // precession into longitude — +0.111°/day = 40.6°/yr of phase drift, which
    // once put the sim Moon 102° from the Sun at this very instant (a quarter
    // moon during a real total eclipse). Any slip of that family misses the 2°
    // gate by tens of degrees.
    const eclipseJd = 2_460_409.2625;

    const earthHelioMpc = keplerianPositionMpc(propagateElements(elementsById('earth'), eclipseJd));
    const moonGeoMpc = keplerianPositionMpc(propagateElements(elementsById('moon'), eclipseJd));

    // The Sun sits at the heliocentric focus, so from Earth it lies along
    // −(Earth's heliocentric offset); the Moon's geocentric offset is already
    // the Earth→Moon direction.
    const sunFromEarth: Vec3 = [-earthHelioMpc[0], -earthHelioMpc[1], -earthHelioMpc[2]];

    const dot =
      sunFromEarth[0] * moonGeoMpc[0] +
      sunFromEarth[1] * moonGeoMpc[1] +
      sunFromEarth[2] * moonGeoMpc[2];
    const mags = Math.hypot(...sunFromEarth) * Math.hypot(...moonGeoMpc);
    const separationDeg = (Math.acos(Math.min(1, Math.max(-1, dot / mags))) * 180) / Math.PI;

    expect(separationDeg).toBeLessThan(2);
  });
});
