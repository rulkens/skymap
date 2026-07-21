/**
 * Derive the physical stellar properties the star InfoCard shows — effective
 * temperature, luminosity, and radius — from the two numbers every Gaia field
 * star already carries: absolute G magnitude and BP−RP colour.
 *
 * The composition, no new physics:
 *   1. `isGiantStar` picks the dwarf/giant Mucciarelli+21 relation.
 *   2. `starTeffK` turns colour into T_eff (arXiv:2106.03882).
 *   3. `starLuminositySolar` adds the Andrae+18 bolometric correction (A&A 616
 *      A8) and the IAU zero-point to get L/L☉.
 *   4. `starRadiusSolar` applies Stefan–Boltzmann for R/R☉.
 *
 * `extrapolated` is true when the raw colour fell outside the chosen relation's
 * validity range (the same [cMin, cMax] `starTeffK` clamps to) — the card marks
 * those rows, because a clamped colour means the temperature (and everything
 * derived from it) is a boundary read, not a fit.
 *
 * Caveats worth repeating at the composition boundary: [Fe/H] = 0 is assumed,
 * no extinction is applied (a reddened distant star reads too cool and too
 * large), and the absolute magnitude is LUT-quantised. These are
 * order-of-magnitude ESTIMATES whose job is separating dwarfs from giants at a
 * glance, not stellar astrophysics.
 */
import { isGiantStar } from './isGiantStar';
import { starTeffK } from './starTeffK';
import { starLuminositySolar } from './starLuminositySolar';
import { starRadiusSolar } from './starRadiusSolar';
import { STAR_TEFF_COEFFICIENTS } from './starTeffCoefficients';

export type DerivedStarProperties = {
  teffK: number;
  luminositySolar: number;
  radiusSolar: number;
  giant: boolean;
  extrapolated: boolean;
};

export function deriveStarProperties(absMagG: number, bpRp: number): DerivedStarProperties {
  const giant = isGiantStar(absMagG, bpRp);
  const kind = giant ? 'giant' : 'dwarf';
  const { cMin, cMax } = STAR_TEFF_COEFFICIENTS[kind];
  const extrapolated = bpRp < cMin || bpRp > cMax;

  const teffK = starTeffK(bpRp, kind);
  const luminositySolar = starLuminositySolar(absMagG, teffK);
  const radiusSolar = starRadiusSolar(luminositySolar, teffK);

  return { teffK, luminositySolar, radiusSolar, giant, extrapolated };
}
