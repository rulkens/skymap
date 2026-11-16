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

  it('matches the original full-grid algorithm byte for byte on islands, a wide gap and an edge island', () => {
    const size = 48;
    const claims = new Int32Array(size * size).fill(ATLAS_CLAIM.free);
    const rgb = new Uint8Array(size * size * 3);
    const paint = (x0: number, y0: number, w: number, h: number, id: number): void => {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const i = y * size + x;
          claims[i] = id === -2 ? ATLAS_CLAIM.orphan : id;
          rgb[3 * i] = (id * 53 + x * 7) & 255;
          rgb[3 * i + 1] = (id * 29 + y * 11) & 255;
          rgb[3 * i + 2] = (id * 71 + x * y) & 255;
        }
      }
    };
    paint(0, 0, 3, 5, 0); // touches the corner and two edges
    paint(10, 8, 2, 2, 1);
    paint(13, 9, 1, 1, 2); // one-texel gap to island 1
    paint(40, 40, 8, 8, 3); // >16 texels from everything else
    paint(20, 30, 2, 2, -2); // orphan texels count as filled

    const expectedRgb = rgb.slice();
    const expectedClaims = claims.slice();
    referenceDilate(size, expectedClaims, expectedRgb);
    dilateAtlas({ sizePx: size, rgb }, claims);

    expect(Buffer.from(rgb)).toEqual(Buffer.from(expectedRgb));
    expect(claims).toEqual(expectedClaims);
  });
});

/** The pre-frontier algorithm, kept as the oracle: 16 full-grid double-buffered passes. */
function referenceDilate(size: number, claims: Int32Array, rgb: Uint8Array): void {
  let pc = claims;
  let pr = rgb;
  for (let pass = 0; pass < 16; pass++) {
    const nc = pc.slice();
    const nr = pr.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (pc[i] !== ATLAS_CLAIM.free) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let ny = Math.max(0, y - 1); ny <= Math.min(size - 1, y + 1); ny++) {
          for (let nx = Math.max(0, x - 1); nx <= Math.min(size - 1, x + 1); nx++) {
            const ni = ny * size + nx;
            if ((nx === x && ny === y) || pc[ni] === ATLAS_CLAIM.free) continue;
            r += pr[3 * ni]!;
            g += pr[3 * ni + 1]!;
            b += pr[3 * ni + 2]!;
            n++;
          }
        }
        if (n === 0) continue;
        nr[3 * i] = Math.round(r / n);
        nr[3 * i + 1] = Math.round(g / n);
        nr[3 * i + 2] = Math.round(b / n);
        nc[i] = ATLAS_CLAIM.dilated;
      }
    }
    pc = nc;
    pr = nr;
  }
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let filled = 0;
  for (let i = 0; i < size * size; i++) {
    if (pc[i] === ATLAS_CLAIM.free) continue;
    mr += pr[3 * i]!;
    mg += pr[3 * i + 1]!;
    mb += pr[3 * i + 2]!;
    filled++;
  }
  mr = Math.round(mr / filled);
  mg = Math.round(mg / filled);
  mb = Math.round(mb / filled);
  for (let i = 0; i < size * size; i++) {
    if (pc[i] !== ATLAS_CLAIM.free) continue;
    pr[3 * i] = mr;
    pr[3 * i + 1] = mg;
    pr[3 * i + 2] = mb;
    pc[i] = ATLAS_CLAIM.dilated;
  }
  claims.set(pc);
  rgb.set(pr);
}
