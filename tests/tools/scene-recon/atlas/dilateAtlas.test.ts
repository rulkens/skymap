import { describe, expect, it } from 'vitest';

import { ATLAS_CLAIM } from '../../../../tools/scene-recon/atlas/atlasClaims';
import { dilateAtlas } from '../../../../tools/scene-recon/atlas/dilateAtlas';
import type { AtlasImage } from '../../../../tools/scene-recon/@types/AtlasImage';

const SIZE_PX = 64;
const BACKGROUND_COLUMNS = 21; // x in [0, 21): a large claimed region, far from the seed
const RED_SEED: [number, number] = [42, 32]; // fully interior — all 8 neighbours exist

function at(rgb: Uint8Array, x: number, y: number): [number, number, number] {
  const i = (y * SIZE_PX + x) * 3;
  return [rgb[i]!, rgb[i + 1]!, rgb[i + 2]!];
}

describe('dilateAtlas', () => {
  it('grows one ring per pass and leaves no empty texel', () => {
    const claims = new Int32Array(SIZE_PX * SIZE_PX).fill(ATLAS_CLAIM.free);
    const rgb = new Uint8Array(SIZE_PX * SIZE_PX * 3);

    for (let y = 0; y < SIZE_PX; y++) {
      for (let x = 0; x < BACKGROUND_COLUMNS; x++) {
        const i = y * SIZE_PX + x;
        claims[i] = 0;
        rgb[3 * i] = 0;
        rgb[3 * i + 1] = 255;
        rgb[3 * i + 2] = 255; // cyan
      }
    }
    const [rx, ry] = RED_SEED;
    const seedIndex = ry * SIZE_PX + rx;
    claims[seedIndex] = 1;
    rgb[3 * seedIndex] = 255;
    rgb[3 * seedIndex + 1] = 0;
    rgb[3 * seedIndex + 2] = 0;

    const atlas: AtlasImage = { sizePx: SIZE_PX, rgb };
    dilateAtlas(atlas, claims);

    // The seed's 8 neighbours had no other colour to average, so they came out pure red.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        expect(at(atlas.rgb, rx + dx, ry + dy)).toEqual([255, 0, 0]);
      }
    }

    // (60, 60) is Chebyshev distance 28 from the seed and 40 from the background block — beyond
    // 16 passes' reach from either — so it only gets coloured by the final atlas-mean fallback,
    // a blend of the cyan background and the grown red patch, neither pure red nor pure black.
    const far = at(atlas.rgb, 60, 60);
    expect(far).not.toEqual([255, 0, 0]);
    expect(far).not.toEqual([0, 0, 0]);

    // Nothing is left at the free sentinel.
    for (let i = 0; i < SIZE_PX * SIZE_PX; i++) {
      expect(claims[i]).not.toBe(ATLAS_CLAIM.free);
    }
  });
});
