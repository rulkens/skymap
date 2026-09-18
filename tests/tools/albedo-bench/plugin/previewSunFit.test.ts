/**
 * previewSunFit — the two real bugs this guards: the cap not holding once a
 * box gets big (arrow/window count still blows up), and the factor kicking
 * in where it shouldn't (a detail-zoom box the user is actually tuning).
 */
import { describe, expect, it } from 'vitest';
import type { AlbedoRecipe } from '../../../../tools/textures/AlbedoRecipe';
import {
  PREVIEW_MAX_ARROWS,
  previewSunFit,
} from '../../../../tools/albedo-bench/plugin/previewSunFit';

const RADIUS_M = 3_390_000; // Mars datum radius, same order as the real bench.

const SUN_FIT: AlbedoRecipe['sunFit'] = {
  windowKm: 40,
  strideKm: 20,
  highPassKm: 15,
  minConfidence: 0.2,
  fillSigmaKm: 60,
};

// Mirrors fitSunField's fillOutputGrid post spacing (stride/2 in both axes)
// to check the cap actually held, independent of previewSunFit's own math.
function estimatedArrows(
  box: { west: number; east: number; south: number; north: number },
  strideKm: number,
): number {
  const kmPerDeg = (RADIUS_M / 1000) * (Math.PI / 180);
  const latCenter = (box.north + box.south) / 2;
  const latSpanKm = (box.north - box.south) * kmPerDeg;
  const lonSpanKm = (box.east - box.west) * kmPerDeg * Math.cos((latCenter * Math.PI) / 180);
  return ((2 * lonSpanKm) / strideKm + 1) * ((2 * latSpanKm) / strideKm + 1);
}

describe('previewSunFit', () => {
  it('leaves a detail-zoom box (the Gale preset) untouched — factor 1, not coarsened', () => {
    const box = { west: 136.4, east: 138.4, south: -5.6, north: -3.6 };
    const result = previewSunFit({ sunFit: SUN_FIT, box, radiusM: RADIUS_M });
    expect(result.coarsened).toBe(false);
    expect(result.sunFit).toEqual(SUN_FIT);
  });

  it('caps the whole-planet box under PREVIEW_MAX_ARROWS instead of scaling with area unbounded', () => {
    const box = { west: -180, east: 180, south: -90, north: 90 };
    const result = previewSunFit({ sunFit: SUN_FIT, box, radiusM: RADIUS_M });
    expect(result.coarsened).toBe(true);
    expect(estimatedArrows(box, result.sunFit.strideKm)).toBeLessThanOrEqual(PREVIEW_MAX_ARROWS);
    expect(result.sunFit.strideKm).toBeGreaterThan(SUN_FIT.strideKm);
    // windowKm/highPassKm/fillSigmaKm stay at the recipe's own values —
    // scaling them too would feed fitSunField's growRegion margin into the
    // cos(lat) blowup documented in previewSunFit's own header (measured:
    // a crash at a 90° box).
    expect(result.sunFit.windowKm).toBe(SUN_FIT.windowKm);
    expect(result.sunFit.highPassKm).toBe(SUN_FIT.highPassKm);
    expect(result.sunFit.fillSigmaKm).toBe(SUN_FIT.fillSigmaKm);
    expect(result.sunFit.minConfidence).toBe(SUN_FIT.minConfidence);
  });
});
