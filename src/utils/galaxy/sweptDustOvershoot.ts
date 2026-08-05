/**
 * sweptDustOvershoot — a texel's swept-channel placement signal: how far
 * `texel.dust` sits ABOVE the automaton's ambient pedestal
 * (`SF_MAP_AMBIENT_DUST`). Raw `texel.dust` is almost all pedestal (measured
 * p50 ~= 1.0, cavities ~0.36, rims ~1.4), so a CDF built on the raw value is
 * nearly flat and hands cavities/untouched ambient placement mass they
 * should not get. Clouds are clumped/swept matter, so only the overshoot is
 * placement-worthy — ambient AND cavities alike clamp to zero here.
 *
 * `SF_MAP_AMBIENT_DUST` mirrors sfMapStep.wesl's step-0 seed
 * (`vec4<f32>(1.0, 1.0e4, 1.0, 0.0)`), an inline literal there rather than a
 * named WESL const (unlike `DUST_OVERSHOOT_CEILING`), so there is no live
 * TS<->WESL parity guard for this value today.
 */
import type { SfMapDensityTexel } from './buildSfMapDustCdf';

/** Ambient/step-0 dust level the SSPSF automaton seeds every texel to (sfMapStep.wesl). */
export const SF_MAP_AMBIENT_DUST = 1.0;

export function sweptDustOvershoot(texel: SfMapDensityTexel): number {
  return Math.max(0, texel.dust - SF_MAP_AMBIENT_DUST);
}
