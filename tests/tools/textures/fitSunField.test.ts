/** The fit's correctness (a planted `g` recovered from an analytic terrain,
 *  and not spuriously recovered from a tilt that plants none) and its one
 *  hard invariant — a region's field equals a larger region's field inside
 *  it, the property the real bake depends on to fit the globe once and let
 *  the bench fit only its own view. Small regions keep this fast. */
import { describe, expect, it } from 'vitest';

import { fitSunField } from '../../../tools/textures/fitSunField';
import { sampleSunField } from '../../../tools/utils/textures/sampleSunField';
import { constantHeightSource } from '../../../tools/textures/constantHeightSource';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';
import type { HeightSource } from '../../../tools/textures/HeightSource';
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
const DEG_TO_RAD = Math.PI / 180;

// The committed Mars recipe's own numbers, minus its confidence gate: finding
// 1's leak scores so low on confidence (~0.006) that the committed
// `minConfidence: 0.2` masks it via the fill's g=0 prior, hiding the bug the
// regression below exists to catch.
const COMMITTED_SUN_FIT = {
  windowKm: 40,
  strideKm: 20,
  highPassKm: 15,
  minConfidence: 0,
  fillSigmaKm: 60,
};

// A ripple (for non-degenerate local slope) riding on a real regional tilt,
// so a fit with g planted at 0 can still show the high-pass's DC leak
// correlating the tilt's slope with the tilt-free luminance.
function tiltedHeightSource(tiltSlope: number, refLatDeg: number): HeightSource {
  const rippleAmplitudeM = 100;
  const cyclesPerRevolution = 1420; // ~15 km wavelength at RADIUS_M
  return {
    id: 'tilted-fake-height',
    attribution: 'test',
    maxLevel: 12,
    coverage: [{ west: -180, east: 180, south: -90, north: 90 }],
    provenance: { sourceId: 'tilted-fake-height', attribution: 'test', vintage: '2026' },
    async readGrid(z, i0, j0, nx, ny) {
      const step = heightLatticeStepDeg(z);
      const grid = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const lat = 90 - (j0 + j) * step;
        const northDistanceM = (lat - refLatDeg) * DEG_TO_RAD * RADIUS_M;
        for (let i = 0; i < nx; i++) {
          const lon = -180 + (i0 + i) * step;
          const ripple =
            rippleAmplitudeM * Math.sin(cyclesPerRevolution * lon * DEG_TO_RAD) +
            rippleAmplitudeM * Math.sin(cyclesPerRevolution * lat * DEG_TO_RAD);
          grid[j * nx + i] = ripple + tiltSlope * northDistanceM;
        }
      }
      return grid;
    },
    async boundsInBox() {
      return [-1e6, 1e6];
    },
  };
}

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
    // Now that both fits share the same 3σ cutoff, every window a cell can
    // see is identical between the two regions; the residual is pure float
    // rounding, several orders below the pre-cutoff 1.2e-3 leak.
    expect(maxDelta).toBeLessThan(1e-9);
  }, 30_000);

  it('a regional tilt with g planted at 0 does not leak into the fit', async () => {
    const refLatDeg = 15;
    const height = tiltedHeightSource(0.03, refLatDeg);
    const g: readonly [number, number] = [0, 0];
    const imagery = analyticImagerySource(height, [0.3, 0.3, 0.3], g);
    const region = { west: 19, east: 21, south: 14, north: 16 };

    const field = await fitSunField({
      imagery,
      height,
      region,
      sunFit: COMMITTED_SUN_FIT,
      radiusM: RADIUS_M,
    });
    const [gx, gy] = sampleSunField(field, 20, refLatDeg);

    expect(Math.abs(gx)).toBeLessThan(0.02);
    expect(Math.abs(gy)).toBeLessThan(0.02);
  }, 20_000);

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
