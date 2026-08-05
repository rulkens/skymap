/**
 * sweptDustOvershoot — a texel's swept-channel placement signal: how far
 * `texel.dust` sits ABOVE the automaton's ambient pedestal
 * (`SF_MAP_AMBIENT_DUST`). Raw `texel.dust` is almost all pedestal (measured
 * p50 ~= 1.0, cavities ~0.36, rims ~1.4), so a CDF built on the raw value is
 * nearly flat and hands cavities/untouched ambient placement mass they
 * should not get. Clouds are clumped/swept matter, so only the overshoot is
 * placement-worthy — ambient AND cavities alike clamp to zero here.
 *
 * `SF_MAP_AMBIENT_DUST` mirrors sfMapAutomatonStep.wesl's (and
 * sfMapFluidStep.wesl's) step-0 seed, and is also what every GPU consumer of
 * the swept channel (sfMapDustBlur.wesl, dustDetail.wesl, sfMapPresent.wesl)
 * subtracts off — all five WESL mirrors are parity-tested against this
 * export in constants.parity.test.ts.
 */
import type { SfMapDensityTexel } from './buildSfMapDustCdf';

/** Ambient/step-0 dust level BOTH SF-map generators seed every texel to (sfMapAutomatonStep.wesl, sfMapFluidStep.wesl). */
export const SF_MAP_AMBIENT_DUST = 1.0;

export function sweptDustOvershoot(texel: SfMapDensityTexel): number {
  return Math.max(0, texel.dust - SF_MAP_AMBIENT_DUST);
}
