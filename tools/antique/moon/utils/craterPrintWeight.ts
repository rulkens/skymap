import type { CraterRimFit } from '../@types/CraterRimFit';
import { clamp } from '../../../utils/textures/clamp';

/**
 * How strongly a crater's rim prints, 0..1: its depth against a fresh crater's of that
 * size (Pike 1977: 0.2·D simple, 1.04·D^0.301 km complex past 15 km), ramped 0.1 → 0.4,
 * so old walled plains keep their rims and only buried ghosts (Wargentin) drop out;
 * times how surely the DEM found the crest.
 */
export function craterPrintWeight(fit: CraterRimFit, diameterKm: number): number {
  const freshDepthKm = diameterKm < 15 ? 0.2 * diameterKm : 1.04 * diameterKm ** 0.301;
  const ratio = fit.depthKm / freshDepthKm;
  return clamp((ratio - 0.1) / 0.3, 0, 1) * clamp((fit.confidence - 0.3) / 0.4, 0, 1);
}
