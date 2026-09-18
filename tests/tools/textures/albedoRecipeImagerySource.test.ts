/** No-seam (the box gets sliced two different ways and must agree) and the
 *  out-of-bounds guard — the decorator's two hard invariants. */
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
    ev: 0,
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

    // 0.1° at 32 px is a 0.003125° pitch, below readSlopeLattice's ~0.011°
    // post step: every pixel centre lands within one post of the shared
    // edge, so a dropped margin would fail this, not slide through it.
    const box = { west: -0.05, east: 0.05, south: -0.025, north: 0.025 };
    const widthPx = 32;
    const heightPx = 16;
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

    const stitched = new Uint8Array(whole!.length);
    for (let py = 0; py < heightPx; py++) {
      for (let halfPx = 0; halfPx < widthPx / 2; halfPx++) {
        for (let c = 0; c < 4; c++) {
          stitched[(py * widthPx + halfPx) * 4 + c] =
            westHalf![(py * (widthPx / 2) + halfPx) * 4 + c]!;
          stitched[(py * widthPx + widthPx / 2 + halfPx) * 4 + c] =
            eastHalf![(py * (widthPx / 2) + halfPx) * 4 + c]!;
        }
      }
    }
    expect(stitched).toEqual(whole);
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
