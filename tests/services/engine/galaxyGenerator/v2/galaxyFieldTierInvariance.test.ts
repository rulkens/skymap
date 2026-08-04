/**
 * How bright a galaxy is must be a property of the GALAXY, never of the LOD
 * tier drawing it. The field's anchor used to be the sprite budget
 * (`modelledStars * starSize^2`, so flux went as N^(1/3)): a tier step moved
 * the Milky Way's absolute flux by 26% with its structure untouched, which no
 * internal-consistency ledger can see and which the screen hid because the
 * sprite bag drifted by the same factor. Both flux sites are covered — the
 * mixture and the additive HII tier — because re-anchoring one alone silently
 * rescales the HII-to-disc ratio instead.
 */
import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import {
  DEFAULT_GALAXY_FIELD_TUNING,
  buildGalaxyFieldMixture,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { buildHiiRegions } from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import { REFERENCE_GALAXIES } from '../../../../../tools/galaxy-renderer/src/data/referenceGalaxies';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';

/** A Gaussian's 3D integral from its packed INVERSE covariance — as in the flux ledger. */
function componentFlux(component: GalaxyFieldComponent): number {
  const [xx, yy, zz] = component.invCovDiagonal;
  const [xy, xz, yz] = component.invCovOffDiagonal;
  const det = xx * (yy * zz - yz * yz) - xy * (xy * zz - yz * xz) + xz * (xy * yz - yy * xz);
  return det > 0 ? (component.amplitude * (2 * Math.PI) ** 1.5) / Math.sqrt(det) : 0;
}

/**
 * Flux keyed by COLOUR, which is one key per population (disc, bulge, bar,
 * halo, arms) without the test having to import the mixture's private palette.
 * Splitting it that way is what makes a normalisation that was "fixed" by
 * flattening the structure fail instead of pass.
 */
type Signature = {
  components: number;
  amplitudeSum: number;
  fluxByPopulation: Record<string, number>;
  hiiComponents: number;
  hiiFlux: number;
};

function signatureOf(params: Record<string, unknown>, starCount: number): Signature {
  const description = describeGalaxy({ ...params, starCount } as never);
  const mixture = buildGalaxyFieldMixture(description, DEFAULT_GALAXY_FIELD_TUNING);
  const fluxByPopulation: Record<string, number> = {};
  let amplitudeSum = 0;
  for (const component of mixture) {
    amplitudeSum += component.amplitude;
    const key = component.color.join(',');
    fluxByPopulation[key] = (fluxByPopulation[key] ?? 0) + componentFlux(component);
  }
  const hii = buildHiiRegions(
    description,
    DEFAULT_GALAXY_FIELD_TUNING,
    DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
    description.seed,
  );
  return {
    components: mixture.length,
    amplitudeSum,
    fluxByPopulation,
    hiiComponents: hii.length,
    hiiFlux: hii.reduce((sum, component) => sum + componentFlux(component), 0),
  };
}

/**
 * Half and double bracket the app's own tier ladder
 * (`MILKY_WAY_STARS_PER_TIER`); `totalStarBudget`'s 20 000 floor and a budget
 * an order of magnitude past any preset's bracket the whole reachable range.
 */
const BUDGET_MULTIPLIERS = [0.5, 2];
const ABSOLUTE_BUDGETS = [20_000, 1_200_000];

describe('analytic field flux is invariant to the sprite budget', () => {
  it.each(REFERENCE_GALAXIES)('$id emits the same light at every tier', (ref) => {
    const params = ref.params as unknown as Record<string, unknown>;
    const own = (params.starCount as number | undefined) ?? 400_000;
    const base = signatureOf(params, own);
    // Exact equality, not a tolerance: nothing downstream of the budget feeds
    // the field at all any more, so these are the same doubles.
    expect(base.amplitudeSum).toBeGreaterThan(0);
    for (const starCount of [
      ...BUDGET_MULTIPLIERS.map((multiplier) => own * multiplier),
      ...ABSOLUTE_BUDGETS,
    ]) {
      expect(signatureOf(params, starCount)).toEqual(base);
    }
  });

  // The HII half of the property above is vacuous on the presets that form no
  // stars, so pin that some of them really do carry flux through it.
  it('exercises the HII tier on the Milky Way', () => {
    const mw = REFERENCE_GALAXIES.find((ref) => ref.id === 'mw')!;
    const params = mw.params as unknown as Record<string, unknown>;
    expect(signatureOf(params, params.starCount as number).hiiFlux).toBeGreaterThan(0);
  });
});
