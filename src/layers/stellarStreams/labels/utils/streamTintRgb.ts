import type { Vec3 } from '../../../../@types/math/Vec3';
import { lerp } from '../../../../utils/math/lerp';
import { starTintFromBpRp } from '../../../../utils/color/starTintFromBpRp';
import { STREAM_BP_RP_RANGE } from '../../streaks/data/stellarStreamColours.constants';
import { STELLAR_STREAM_LABEL_TINT } from '../data/stellarStreamLabelStyle.constants';

/**
 * A caption's colour from its stream's mean `colourT`, exaggerated on purpose: real stream means span
 * only BP−RP ≈ 0.8–1.15, near-white on screen, so the index is stretched about a pivot and the tint
 * saturated, keeping the order (metal-poor blue, median white, Sagittarius orange). Peak channel 1, so
 * dim tints stay legible as text.
 */
export function streamTintRgb(colourT: number): Vec3 {
  const { bpRpPivot, bpRpStretch, saturation } = STELLAR_STREAM_LABEL_TINT;
  const bpRp = lerp(STREAM_BP_RP_RANGE[0], STREAM_BP_RP_RANGE[1], colourT);
  const rgb = starTintFromBpRp(bpRpPivot + bpRpStretch * (bpRp - bpRpPivot));
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const vivid = rgb.map((c) => Math.max(0, luma + saturation * (c - luma)));
  const peak = Math.max(...vivid);
  return [vivid[0]! / peak, vivid[1]! / peak, vivid[2]! / peak];
}
