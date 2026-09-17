/** The fit's correctness (a planted `g` recovered from an analytic terrain)
 *  and its one hard invariant (a region's field equals a larger region's
 *  field inside it — R-P2, the property the real bake depends on to fit the
 *  globe once and let the bench fit only its own view). Small regions keep
 *  this fast at `FIT_CANVAS_LEVEL`. */
import { describe, expect, it } from 'vitest';

import { fitSunField } from '../../../tools/textures/fitSunField';
import { sampleSunField } from '../../../tools/utils/textures/sampleSunField';
import { constantHeightSource } from '../../../tools/textures/constantHeightSource';
import type { SurfaceImagerySource } from '../../../tools/textures/SurfaceImagerySource';
import { analyticHeightSource, analyticImagerySource } from '../../fixtures/textures/albedoFakes';

const SUN_FIT = {
  windowKm: 20,
  strideKm: 10,
  highPassKm: 5,
  minConfidence: 0.2,
  fillSigmaKm: 25,
};

// Must match albedoFakes' fixed radius: it bakes the same value into the
// analytic imagery's slope-driven shading.
const RADIUS_M = 3_390_000;

function flatImagerySource(rgb: readonly [number, number, number]): SurfaceImagerySource {
  return {
    id: 'flat-fake-imagery',
    attribution: 'test',
    maxLevel: 12,
    coverage: [{ west: -180, east: 180, south: -90, north: 90 }],
    provenance: { sourceId: 'flat-fake-imagery', attribution: 'test', vintage: '2026' },
    async readBox(_box, widthPx, heightPx) {
      const out = new Uint8Array(widthPx * heightPx * 4);
      for (let i = 0; i < widthPx * heightPx; i++) {
        out[i * 4] = rgb[0];
        out[i * 4 + 1] = rgb[1];
        out[i * 4 + 2] = rgb[2];
        out[i * 4 + 3] = 255;
      }
      return out;
    },
  };
}

describe('fitSunField', () => {
  it('recovers the planted uniform g at the region centre within 10%', async () => {
    const g: readonly [number, number] = [0.5, -0.25];
    const height = analyticHeightSource();
    const imagery = analyticImagerySource(height, [0.3, 0.3, 0.3], g);
    const region = { west: 19, east: 21, south: 14, north: 16 };

    const field = await fitSunField({
      imagery,
      height,
      region,
      sunFit: SUN_FIT,
      radiusM: RADIUS_M,
    });
    const [gx, gy] = sampleSunField(field, 20, 15);

    expect(Math.abs(gx - g[0])).toBeLessThan(0.1 * Math.abs(g[0]));
    expect(Math.abs(gy - g[1])).toBeLessThan(0.1 * Math.abs(g[1]));
  }, 20_000);

  it('regional field equals the field of a 3x larger region inside the smaller region', async () => {
    const g: readonly [number, number] = [0.5, -0.25];
    const height = analyticHeightSource();
    const imagery = analyticImagerySource(height, [0.3, 0.3, 0.3], g);
    const smallRegion = { west: 19, east: 21, south: 14, north: 16 };
    const bigRegion = { west: 17, east: 23, south: 11, north: 19 };

    const smallField = await fitSunField({
      imagery,
      height,
      region: smallRegion,
      sunFit: SUN_FIT,
      radiusM: RADIUS_M,
    });
    const bigField = await fitSunField({
      imagery,
      height,
      region: bigRegion,
      sunFit: SUN_FIT,
      radiusM: RADIUS_M,
    });

    let maxDelta = 0;
    for (const [lon, lat] of [
      [19.5, 14.5],
      [20, 15],
      [20.5, 15.5],
    ] as const) {
      const [smallGx, smallGy] = sampleSunField(smallField, lon, lat);
      const [bigGx, bigGy] = sampleSunField(bigField, lon, lat);
      maxDelta = Math.max(maxDelta, Math.abs(smallGx - bigGx), Math.abs(smallGy - bigGy));
    }
    expect(maxDelta).toBeLessThan(1e-4);
  }, 30_000);

  it('a region of flat terrain yields g = 0 everywhere, not NaN', async () => {
    const imagery = flatImagerySource([120, 120, 120]);
    const height = constantHeightSource(0);
    const region = { west: 19, east: 21, south: 14, north: 16 };

    const field = await fitSunField({
      imagery,
      height,
      region,
      sunFit: SUN_FIT,
      radiusM: RADIUS_M,
    });
    for (let i = 0; i < field.gx.length; i++) {
      expect(Number.isFinite(field.gx[i])).toBe(true);
      expect(Number.isFinite(field.gy[i])).toBe(true);
      expect(field.gx[i]).toBe(0);
      expect(field.gy[i]).toBe(0);
    }
  });
});
