/**
 * buildYoungStarChain — spec docs/superpowers/specs/2026-08-09-young-stars-
 * field-design.md §3: deterministic per seed, flux scales with brightness,
 * across-sigma tracks `armCrossSigma`'s own radius law, spur arms
 * contribute, and the disabled/zero-brightness gate returns nothing.
 */
import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { buildYoungStarChain } from '../../../../../src/services/engine/galaxyGenerator/v2/youngStarChain';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

// One arm: keeps sampleArmRidgeNodes' own increasing-radius node order a
// reliable inner/outer bracket for the sigma test below, without a second
// arm's own (possibly lower) starting radius interleaving into it.
const PARAMS: GalaxyParams = {
  type: 'Sb',
  shared: { seed: 42, armCount: 1 },
  legacy: { starCount: 100000 },
};
const geometry = describeGalaxy(PARAMS);

function tuningWith(overrides: {
  readonly spursEnabled?: boolean;
  readonly enabled?: boolean;
  readonly brightness?: number;
  readonly width?: number;
  readonly edgeBias?: number;
}): GalaxyFieldTuning {
  return {
    ...DEFAULT_GALAXY_FIELD_TUNING,
    arms: {
      ...DEFAULT_GALAXY_FIELD_TUNING.arms,
      spurs: {
        ...DEFAULT_GALAXY_FIELD_TUNING.arms.spurs,
        enabled: overrides.spursEnabled ?? false,
      },
    },
    hii: {
      ...DEFAULT_GALAXY_FIELD_TUNING.hii,
      youngStars: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii.youngStars,
        enabled: overrides.enabled ?? true,
        brightness: overrides.brightness ?? 1,
        width: overrides.width ?? 1,
        edgeBias: overrides.edgeBias ?? DEFAULT_GALAXY_FIELD_TUNING.hii.youngStars.edgeBias,
      },
    },
  };
}

/**
 * A Gaussian's 3D integral from a component's packed INVERSE covariance —
 * same recovery `galaxyFieldFluxLedger.test.ts`'s own `componentFlux` uses.
 */
function componentFlux(component: GalaxyFieldComponent): number {
  const [xx, yy, zz] = component.invCovDiagonal;
  const [xy, xz, yz] = component.invCovOffDiagonal;
  const det = xx * (yy * zz - yz * yz) - xy * (xy * zz - yz * xz) + xz * (xy * yz - yy * xz);
  return det > 0 ? (component.amplitude * (2 * Math.PI) ** 1.5) / Math.sqrt(det) : 0;
}

function totalFlux(components: readonly GalaxyFieldComponent[]): number {
  return components.reduce((sum, component) => sum + componentFlux(component), 0);
}

/** In-plane radius from `center`'s [x, y, z], `y` the pole axis — hiiRegions.test.ts's own convention. */
function fluxWeightedMeanRadius(components: readonly GalaxyFieldComponent[]): number {
  let fluxSum = 0;
  let weightedRadiusSum = 0;
  for (const component of components) {
    const flux = componentFlux(component);
    const [x, , z] = component.center;
    fluxSum += flux;
    weightedRadiusSum += flux * Math.hypot(x, z);
  }
  return weightedRadiusSum / fluxSum;
}

describe('buildYoungStarChain', () => {
  it('is deterministic for a fixed seed', () => {
    const tuning = tuningWith({});
    const a = buildYoungStarChain(geometry, tuning, 7);
    const b = buildYoungStarChain(geometry, tuning, 7);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('scales every component amplitude linearly with brightness — total flux tracks brightness x YOUNG_FLUX_REF', () => {
    const base = buildYoungStarChain(geometry, tuningWith({ brightness: 1 }), 7);
    const doubled = buildYoungStarChain(geometry, tuningWith({ brightness: 2 }), 7);
    expect(base.length).toBeGreaterThan(0);
    expect(doubled.length).toBe(base.length);
    // Volume (sigmaAlong*sigmaAcross*sigmaPole) is brightness-independent, so
    // amplitude = flux/volume scales exactly with flux — the pre-normalization
    // invariant `Sum flux_k = brightness * YOUNG_FLUX_REF` implies node for node.
    for (let i = 0; i < base.length; i++) {
      expect(doubled[i]!.amplitude / base[i]!.amplitude).toBeCloseTo(2, 6);
    }
  });

  it("across-sigma grows with radius, tracking armCrossSigma's own width law", () => {
    // width cranked far past its UI ceiling so sigmaAcross dominates both
    // sigmaAlong (spacing-derived) and the fixed pole sigma — boundRadius
    // then reads as sigmaAcross itself, the same "dominate the max" technique
    // hiiRegions.test.ts's own sizeScale tests use.
    const nodes = buildYoungStarChain(geometry, tuningWith({ width: 200 }), 7);
    expect(nodes.length).toBeGreaterThan(4);
    // Pushed in increasing-radius order (sampleArmRidgeNodes walks outward
    // along the one arm this fixture has), so the ends bracket its span.
    const inner = nodes[0]!;
    const outer = nodes[nodes.length - 1]!;
    expect(outer.boundRadius).toBeGreaterThan(inner.boundRadius);
  });

  it('spur arms contribute additional components', () => {
    const withoutSpurs = buildYoungStarChain(geometry, tuningWith({ spursEnabled: false }), 7);
    const withSpurs = buildYoungStarChain(geometry, tuningWith({ spursEnabled: true }), 7);
    expect(withoutSpurs.length).toBeGreaterThan(0);
    expect(withSpurs.length).toBeGreaterThan(withoutSpurs.length);
  });

  it('edge bias redistributes flux outward, leaving total flux unchanged', () => {
    const flat = buildYoungStarChain(geometry, tuningWith({ edgeBias: 0 }), 7);
    const biased = buildYoungStarChain(geometry, tuningWith({ edgeBias: 3 }), 7);
    expect(flat.length).toBeGreaterThan(0);
    expect(biased.length).toBe(flat.length);
    expect(totalFlux(biased) / totalFlux(flat)).toBeCloseTo(1, 5);
    expect(fluxWeightedMeanRadius(biased)).toBeGreaterThan(fluxWeightedMeanRadius(flat));
  });

  it('returns nothing when disabled or brightness is zero', () => {
    expect(buildYoungStarChain(geometry, tuningWith({ enabled: false }), 7)).toEqual([]);
    expect(buildYoungStarChain(geometry, tuningWith({ brightness: 0 }), 7)).toEqual([]);
  });
});
