/**
 * sweptDustOvershoot — a texel's swept-channel placement signal: how far
 * `texel.dust` sits ABOVE the automaton's ambient pedestal
 * (`ISM_MAP_AMBIENT_DUST`). Raw `texel.dust` is almost all pedestal (measured
 * p50 ~= 1.0, cavities ~0.36, rims ~1.4), so a CDF built on the raw value is
 * nearly flat and hands cavities/untouched ambient placement mass they
 * should not get. Clouds are clumped/swept matter, so only the overshoot is
 * placement-worthy — ambient AND cavities alike clamp to zero here.
 *
 * `ISM_MAP_AMBIENT_DUST` mirrors ismMapAutomatonStep.wesl's (and
 * ismMapFluidStep.wesl's) step-0 seed, and is also what every GPU consumer of
 * the swept channel (ismMapDustBlur.wesl, dustDetail.wesl, ismMapPresent.wesl)
 * subtracts off — all five WESL mirrors are parity-tested against this
 * export in constants.parity.test.ts.
 */
import type { IsmMapDensityTexel } from './buildIsmMapDustCdf';

/** Ambient dust pedestal's MAXIMUM, and the fixed overshoot reference every consumer subtracts (ismMapAutomatonStep.wesl, ismMapFluidStep.wesl). The automaton seeds every texel to exactly this; the fluid generator seeds ISM_MAP_AMBIENT_DUST * gasProfile(r) (<= this, gasProfile's own max is 1), so only the automaton stays uniformly AT the pedestal. */
export const ISM_MAP_AMBIENT_DUST = 1.0;

export function sweptDustOvershoot(texel: IsmMapDensityTexel): number {
  return Math.max(0, texel.dust - ISM_MAP_AMBIENT_DUST);
}
