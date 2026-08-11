/**
 * galaxyPopulationCountShares — how many STARS the sprite tier spends per
 * population: each population's LIGHT (`galaxyLightDecomposition`) divided by
 * what one of its stars emits (`SPRITE_POPULATION_BRIGHTNESS`), renormalised.
 *
 * Light is the physical quantity, a count is a rendering budget, and `shared/`
 * stops at the light — this division is where a count first exists. What the
 * light table cannot say is where inside the disc the sprites go, which is
 * `ARM_LIGHT_SHARE_OF_DISC` below.
 */
import { galaxyLightDecomposition } from '../shared/galaxyLightDecomposition';
import { SPRITE_POPULATION_BRIGHTNESS } from './spritePopulationBrightness';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { GalaxyPopulationCountShares } from '../../../../@types/galaxy/GalaxyPopulationCountShares';

/**
 * How much of the DISC's light the sprite tier draws concentrated on the arm
 * ridges rather than smoothly, at `armStrength` 1 — v1's counterpart of v2's
 * contrast law (`GalaxyArmTuning.contrast`), which does the same job by
 * measuring an excess against the azimuthally averaged disc and debiting it
 * back out.
 *
 * A placement calibration, eyeballed against the sprite tier's grain, NOT a
 * photometric measurement: arms are the same disc light rearranged, so moving
 * this changes where a spiral's stars sit and never how much light it has.
 */
const ARM_LIGHT_SHARE_OF_DISC = 0.5;

/**
 * An irregular's whole disc lane goes to the clump builder — it has no smooth
 * exponential disc to hold the rest, and its clumps are drawn out of the
 * `arm` slot (`carveStarLayout`'s `irregularClumps` range).
 */
function armLightShareOfDisc(category: GalaxyCategory, params: GalaxyParams): number {
  if (category === 'irregular') return 1;
  if (category !== 'spiral' && category !== 'barred') return 0;
  return Math.min(1, Math.max(0, ARM_LIGHT_SHARE_OF_DISC * (params.legacy?.armStrength ?? 1)));
}

export function galaxyPopulationCountShares(
  category: GalaxyCategory,
  params: GalaxyParams,
): GalaxyPopulationCountShares {
  const light = galaxyLightDecomposition(category, params);
  const armLight = light.disc * armLightShareOfDisc(category, params);
  const B = SPRITE_POPULATION_BRIGHTNESS;
  const stars = {
    bulge: light.bulge / B.bulge,
    bar: light.bar / B.bar,
    disk: (light.disc - armLight) / B.disk,
    arm: armLight / (category === 'irregular' ? B.irregularClump : B.arm),
    halo: light.halo / B.halo,
  };
  const total = stars.bulge + stars.bar + stars.disk + stars.arm + stars.halo;
  return {
    bulge: stars.bulge / total,
    bar: stars.bar / total,
    disk: stars.disk / total,
    arm: stars.arm / total,
    halo: stars.halo / total,
  };
}
