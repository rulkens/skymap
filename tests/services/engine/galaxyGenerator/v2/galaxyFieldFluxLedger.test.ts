/**
 * The analytic field's flux ledger: a galaxy emits exactly its own
 * `luminosity`, and the arm ridge chain adds none of its own. Both hold across
 * the whole mixture — five push sites, an arm/disc debit and a particle-cloud
 * split — so they fail on a lane counted twice or a debit skipped, which
 * nothing else reaches `buildGalaxyFieldMixture` to notice.
 *
 * The first test needs no per-population multiplier to state — `light`'s
 * lanes sum to 1, so a lane that quietly re-acquires a sprite constant or a
 * dependency on the star budget fails here as well as in
 * `galaxyFieldTierInvariance.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import {
  DEFAULT_GALAXY_FIELD_TUNING,
  buildGalaxyFieldMixture,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { REFERENCE_GALAXIES } from '../../../../../tools/galaxy-renderer/src/data/referenceGalaxies';
import type { ReferenceGalaxy } from '../../../../../tools/galaxy-renderer/@types/data/ReferenceGalaxy';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldMixtureResult } from '../../../../../src/@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyArmTuning } from '../../../../../src/@types/galaxy/GalaxyArmTuning';

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

/**
 * The spur-cloud tier's reservation carries zero-amplitude placeholders in
 * `result.components` — GPU-side v2 placement fills their real emission
 * post-submit, off this CPU path entirely (`GalaxyFieldMixtureResult`'s own
 * doc). `reservation.flux` is exactly the flux `pushArmRidges`' debit
 * credited to this tier, so folding it back in here keeps this ledger
 * checking what it CAN honestly check from Vitest alone (no WebGPU here):
 * that `buildGalaxyFieldMixture`'s own debit/credit bookkeeping across
 * disc/ridge/cloud/spur is self-consistent. It does NOT check that
 * `placeArmSpurCloud.wesl` actually encodes `reservation.flux` worth of
 * emission into the amplitudes/covariances it writes — a wrong TAU_ROOT3 or
 * swapped sigma in the shader is invisible here. That check lives in
 * `probeGpuErrors.ts`'s `readback:placeArmSpurCloud` step (the only place in
 * the repo that can execute WGSL), which sums the GPU-placed records' own
 * reconstructed flux and compares it against this SAME `reservation.flux`.
 */
function totalFlux(result: GalaxyFieldMixtureResult): number {
  const componentsFlux = result.components.reduce((sum, component) => sum + componentFlux(component), 0);
  return componentsFlux + (result.spurCloudReservation?.flux ?? 0);
}

function geometryOf(ref: ReferenceGalaxy): GalaxyDescription {
  // The gallery types its presets Partial, but `type` is GalaxyParams' one
  // required field and every entry carries it (pinned by referenceGalaxies.test).
  // `shared` is `GalaxyParams`' other required field; every entry carries a
  // (possibly empty) one too, so the fallback is a type satisfier, not a
  // real default.
  return describeGalaxy({ ...ref.params, type: ref.params.type!, shared: ref.params.shared ?? {} });
}

/** Wide enough for the disc fit's own residual, far short of one whole lane. */
const LEDGER_TOLERANCE = 0.003;

/**
 * The Milky Way's total emitted light, in the field's own units. Every tuned
 * `analyticExposure` on disk was calibrated against this number, and it has
 * survived two re-anchorings unchanged (the sprite budget leaving the flux
 * path, then the population multipliers) because each one re-pinned
 * `GALAXY_LUMINOSITY_PER_AREA` to hold it. Moving it is a legitimate decision
 * and a loud one: it re-exposes every preset.
 */
const MILKY_WAY_TOTAL_FLUX = 945.4514;

describe('galaxy field flux ledger', () => {
  it.each(REFERENCE_GALAXIES)('$id emits exactly its own luminosity', (ref) => {
    const geometry = geometryOf(ref);
    const measured = totalFlux(buildGalaxyFieldMixture(geometry));
    expect(Math.abs(measured / geometry.luminosity - 1)).toBeLessThan(LEDGER_TOLERANCE);
  });

  it('the Milky Way emits what every analyticExposure was tuned against', () => {
    const geometry = geometryOf(REFERENCE_GALAXIES.find((ref) => ref.id === 'mw')!);
    const measured = totalFlux(buildGalaxyFieldMixture(geometry));
    expect(Math.abs(measured / MILKY_WAY_TOTAL_FLUX - 1)).toBeLessThan(0.001);
  });

  // The ridge chain's blobs are an EXCESS over the azimuthally averaged disc
  // the mixture was fit to, debited back out of the disc components IN FULL —
  // so an arm knob may move light between the two arm tiers, or drop the arms
  // entirely, but never change how much light there is. Every row below is a
  // tuning that renders a different arm grain; the two that render NO sprite
  // are the ones that regressed, because the cloud's share of the excess was
  // debited from the disc and then emitted by nobody.
  const ARMS = DEFAULT_GALAXY_FIELD_TUNING.arms;
  const CLOUD = ARMS.cloud;
  const ARM_GRAIN_TUNINGS: Record<string, GalaxyArmTuning> = {
    'arms off': { ...ARMS, enabled: false },
    'cloud off': { ...ARMS, cloud: { ...CLOUD, enabled: false } },
    'cloud share 0': { ...ARMS, cloud: { ...CLOUD, share: 0 } },
    'cloud share 1': { ...ARMS, cloud: { ...CLOUD, share: 1 } },
    // Coverage at its slider floor with the largest sprites the sliders
    // allow: on some presets the derived sprite count rounds to zero, which
    // is the same leak with the cloud's own pill still on.
    'cloud starved': { ...ARMS, cloud: { ...CLOUD, coverage: 0.2, sizeScale: 4, elongation: 8 } },
  };

  // m100 (grand-design, two strong arms) and mw (four weaker ones) bracket
  // the contrast law's range.
  const ARM_LEDGER_CASES = ['m100', 'mw'].flatMap((id) =>
    Object.entries(ARM_GRAIN_TUNINGS).map(([label, arms]) => ({ id, label, arms })),
  );

  it.each(ARM_LEDGER_CASES)('$id emits the same total light under "$label"', (testCase) => {
    const geometry = geometryOf(REFERENCE_GALAXIES.find((ref) => ref.id === testCase.id)!);
    const measured = totalFlux(
      buildGalaxyFieldMixture(geometry, { ...DEFAULT_GALAXY_FIELD_TUNING, arms: testCase.arms }),
    );
    const base = totalFlux(buildGalaxyFieldMixture(geometry, DEFAULT_GALAXY_FIELD_TUNING));
    expect(Math.abs(measured / base - 1)).toBeLessThan(LEDGER_TOLERANCE);
  });

  // The ledger above is vacuous unless the arms are actually rendering: a
  // mixture with no arm components conserves flux trivially.
  it.each(['m100', 'mw'])('%s renders arm components for that ledger to be about', (id) => {
    const geometry = geometryOf(REFERENCE_GALAXIES.find((ref) => ref.id === id)!);
    const withArms = buildGalaxyFieldMixture(geometry, DEFAULT_GALAXY_FIELD_TUNING).components.length;
    const without = buildGalaxyFieldMixture(geometry, {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      arms: { ...ARMS, enabled: false },
    }).components.length;
    expect(withArms).toBeGreaterThan(without);
  });
});
