/**
 * The analytic field's flux ledger: total emitted light is a sum over
 * populations, and the arm ridge chain adds none of its own. Both hold across
 * the whole mixture — five push sites, an arm/disc debit and a particle-cloud
 * split — so they fail on a lane counted twice or a debit skipped, which
 * nothing else reaches `buildGalaxyFieldMixture` to notice.
 *
 * The first test PINS the sprite-flux-parity claim (`emissionScale`'s
 * docblock); its anchor constants are restated here so that retiring the
 * claim has to be a deliberate edit rather than silent drift.
 */
import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { SPRITE_POPULATION_BRIGHTNESS } from '../../../../../src/services/engine/galaxyGenerator/shared/spritePopulationBrightness';
import {
  DEFAULT_GALAXY_FIELD_TUNING,
  buildGalaxyFieldMixture,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { REFERENCE_GALAXIES } from '../../../../../tools/galaxy-renderer/src/data/referenceGalaxies';
import type { ReferenceGalaxy } from '../../../../../tools/galaxy-renderer/@types/data/ReferenceGalaxy';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

/**
 * A Gaussian's 3D integral from the components' packed INVERSE covariance:
 * A * (2*pi)^1.5 / sqrt(det M), M the inverse covariance. Test scaffolding —
 * the shader integrates the same quantity but never as a number the CPU sees.
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

function geometryOf(ref: ReferenceGalaxy): GalaxyDescription {
  // The gallery types its presets Partial, but `type` is GalaxyParams' one
  // required field and every entry carries it (pinned by referenceGalaxies.test).
  return describeGalaxy({ ...ref.params, type: ref.params.type! });
}

// `emissionScale`'s three anchor constants — see this file's docblock.
const GLOW_DISC_INTEGRAL = 0.9294;
const MEAN_STAR_LUMINOSITY = 0.2392;
const MEAN_FALLOFF_AND_JITTER = 0.57;

/** What the mixture claims to emit: one scale times the population light shares. */
function predictedFlux(geometry: GalaxyDescription): number {
  const scale =
    geometry.modelledStars *
    geometry.starSize ** 2 *
    GLOW_DISC_INTEGRAL *
    MEAN_STAR_LUMINOSITY *
    MEAN_FALLOFF_AND_JITTER;
  return (
    scale *
    (geometry.light.disc * SPRITE_POPULATION_BRIGHTNESS.disk +
      geometry.light.bulge * SPRITE_POPULATION_BRIGHTNESS.bulge +
      geometry.light.bar * SPRITE_POPULATION_BRIGHTNESS.bar +
      geometry.light.halo * SPRITE_POPULATION_BRIGHTNESS.halo)
  );
}

/** Wide enough for the disc fit's own residual, far short of one whole lane. */
const LEDGER_TOLERANCE = 0.003;

describe('galaxy field flux ledger', () => {
  it.each(REFERENCE_GALAXIES)('$id emits one scale times its population light shares', (ref) => {
    const geometry = geometryOf(ref);
    const measured = totalFlux(buildGalaxyFieldMixture(geometry));
    expect(Math.abs(measured / predictedFlux(geometry) - 1)).toBeLessThan(LEDGER_TOLERANCE);
  });

  // The ridge chain's blobs are an EXCESS over the azimuthally averaged disc
  // the mixture was fit to, debited back out of the disc components IN FULL —
  // so an arm knob may move light between the two arm tiers, or drop the arms
  // entirely, but never change how much light there is. Every row below is a
  // tuning that renders a different arm grain; the two that render NO sprite
  // are the ones that regressed, because the cloud's share of the excess was
  // debited from the disc and then emitted by nobody.
  const ARM_GRAIN_TUNINGS: Record<string, Partial<GalaxyFieldTuning>> = {
    'arms off': { armsEnabled: false },
    'cloud off': { armCloudEnabled: false },
    'cloud share 0': { armCloudShare: 0 },
    'cloud share 1': { armCloudShare: 1 },
    // Coverage at its slider floor with the largest sprites the sliders
    // allow: on some presets the derived sprite count rounds to zero, which
    // is the same leak with the cloud's own pill still on.
    'cloud starved': { armCloudCoverage: 0.2, armCloudSizeScale: 4, armCloudElongation: 8 },
  };

  // m100 (grand-design, two strong arms) and mw (four weaker ones) bracket
  // the contrast law's range.
  const ARM_LEDGER_CASES = ['m100', 'mw'].flatMap((id) =>
    Object.entries(ARM_GRAIN_TUNINGS).map(([label, tuning]) => ({ id, label, tuning })),
  );

  it.each(ARM_LEDGER_CASES)('$id emits the same total light under "$label"', (testCase) => {
    const geometry = geometryOf(REFERENCE_GALAXIES.find((ref) => ref.id === testCase.id)!);
    const measured = totalFlux(
      buildGalaxyFieldMixture(geometry, { ...DEFAULT_GALAXY_FIELD_TUNING, ...testCase.tuning }),
    );
    const base = totalFlux(buildGalaxyFieldMixture(geometry, DEFAULT_GALAXY_FIELD_TUNING));
    expect(Math.abs(measured / base - 1)).toBeLessThan(LEDGER_TOLERANCE);
  });

  // The ledger above is vacuous unless the arms are actually rendering: a
  // mixture with no arm components conserves flux trivially.
  it.each(['m100', 'mw'])('%s renders arm components for that ledger to be about', (id) => {
    const geometry = geometryOf(REFERENCE_GALAXIES.find((ref) => ref.id === id)!);
    const withArms = buildGalaxyFieldMixture(geometry, DEFAULT_GALAXY_FIELD_TUNING).length;
    const without = buildGalaxyFieldMixture(geometry, {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      armsEnabled: false,
    }).length;
    expect(withArms).toBeGreaterThan(without);
  });
});
