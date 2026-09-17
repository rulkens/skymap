/** No-seam (the box gets sliced two different ways and must agree) and the
 *  out-of-bounds guard (R-P3) — the decorator's two hard invariants. */
import { describe, expect, it } from 'vitest';

import { albedoRecipeImagerySource } from '../../../tools/textures/albedoRecipeImagerySource';
import { constantSunField } from '../../../tools/utils/textures/constantSunField';
import type { AlbedoApply } from '../../../tools/textures/AlbedoApply';
import { analyticHeightSource, analyticImagerySource } from '../../fixtures/textures/albedoFakes';

// Matches albedoFakes' fixed radius: the field must agree with what baked
// the analytic imagery's slope-driven shading.
const RADIUS_M = 3_390_000;

const APPLY: AlbedoApply = {
  deshade: { strength: 1, minShading: 0.2 },
  knee: { threshold: 0.6, softness: 1 },
  ice: { minAbsLatDeg: 55, fadeDeg: 8, minWhiteness: 0.6, minLuminance: 0.35 },
  grade: {
    exposureEv: 0,
    gain: [1, 1, 1],
    offset: [0, 0, 0],
    contrast: 1,
    saturation: 1,
    gamma: 1,
  },
};

describe('albedoRecipeImagerySource', () => {
  it('reading a box equals reading its west and east halves side by side', async () => {
    const height = analyticHeightSource();
    const g: readonly [number, number] = [0.4, -0.2];
    const primary = analyticImagerySource(height, [0.3, 0.3, 0.3], g);
    const field = constantSunField({ west: -10, east: 10, south: -10, north: 10 }, g, RADIUS_M);
    const decorated = albedoRecipeImagerySource(primary, height, field, APPLY);

    const box = { west: -1, east: 1, south: -0.5, north: 0.5 };
    const widthPx = 16;
    const heightPx = 8;
    const whole = await decorated.readBox(box, widthPx, heightPx);
    expect(whole).not.toBeNull();

    const westHalf = await decorated.readBox(
      { west: box.west, east: 0, south: box.south, north: box.north },
      widthPx / 2,
      heightPx,
    );
    const eastHalf = await decorated.readBox(
      { west: 0, east: box.east, south: box.south, north: box.north },
      widthPx / 2,
      heightPx,
    );
    expect(westHalf).not.toBeNull();
    expect(eastHalf).not.toBeNull();

    for (let py = 0; py < heightPx; py++) {
      for (let px = 0; px < widthPx; px++) {
        const half = px < widthPx / 2 ? westHalf! : eastHalf!;
        const halfPx = px < widthPx / 2 ? px : px - widthPx / 2;
        for (let c = 0; c < 4; c++) {
          const stitched = half[(py * (widthPx / 2) + halfPx) * 4 + c]!;
          const wholeValue = whole![(py * widthPx + px) * 4 + c]!;
          expect(Math.abs(stitched - wholeValue)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('a box outside the field bounds throws', async () => {
    const height = analyticHeightSource();
    const g: readonly [number, number] = [0.4, -0.2];
    const primary = analyticImagerySource(height, [0.3, 0.3, 0.3], g);
    const field = constantSunField({ west: -1, east: 1, south: -1, north: 1 }, g, RADIUS_M);
    const decorated = albedoRecipeImagerySource(primary, height, field, APPLY);

    await expect(
      decorated.readBox({ west: 5, east: 7, south: -1, north: 1 }, 4, 4),
    ).rejects.toThrow();
  });
});
