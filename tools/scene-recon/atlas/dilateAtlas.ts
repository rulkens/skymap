/**
 * 16 passes of empty-takes-the-mean-of-its-filled-8-neighbours, then the atlas mean colour for
 * whatever is still empty (a black texel bleeds into every chart at low mips). Double-buffered: a
 * pass reads only the previous pass's claims, so single-buffering can't flood the atlas in one pass.
 */
import { ATLAS_CLAIM } from './atlasClaims';
import type { AtlasImage } from '../@types/AtlasImage';

const DILATE_PASSES = 16;

export function dilateAtlas(atlas: AtlasImage, claims: Int32Array): void {
  const { sizePx, rgb } = atlas;
  let prevClaims = claims;
  let prevRgb = rgb;

  for (let pass = 0; pass < DILATE_PASSES; pass++) {
    const nextClaims = prevClaims.slice();
    const nextRgb = prevRgb.slice();

    for (let y = 0; y < sizePx; y++) {
      for (let x = 0; x < sizePx; x++) {
        const i = y * sizePx + x;
        if (prevClaims[i] !== ATLAS_CLAIM.free) continue;

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let ny = Math.max(0, y - 1); ny <= Math.min(sizePx - 1, y + 1); ny++) {
          for (let nx = Math.max(0, x - 1); nx <= Math.min(sizePx - 1, x + 1); nx++) {
            if (nx === x && ny === y) continue;
            const ni = ny * sizePx + nx;
            if (prevClaims[ni] === ATLAS_CLAIM.free) continue;
            r += prevRgb[3 * ni]!;
            g += prevRgb[3 * ni + 1]!;
            b += prevRgb[3 * ni + 2]!;
            count++;
          }
        }
        if (count === 0) continue;
        nextRgb[3 * i] = Math.round(r / count);
        nextRgb[3 * i + 1] = Math.round(g / count);
        nextRgb[3 * i + 2] = Math.round(b / count);
        nextClaims[i] = ATLAS_CLAIM.dilated;
      }
    }

    prevClaims = nextClaims;
    prevRgb = nextRgb;
  }

  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  let filledCount = 0;
  for (let i = 0; i < sizePx * sizePx; i++) {
    if (prevClaims[i] === ATLAS_CLAIM.free) continue;
    meanR += prevRgb[3 * i]!;
    meanG += prevRgb[3 * i + 1]!;
    meanB += prevRgb[3 * i + 2]!;
    filledCount++;
  }
  if (filledCount > 0) {
    meanR = Math.round(meanR / filledCount);
    meanG = Math.round(meanG / filledCount);
    meanB = Math.round(meanB / filledCount);
  }

  for (let i = 0; i < sizePx * sizePx; i++) {
    if (prevClaims[i] !== ATLAS_CLAIM.free) continue;
    prevRgb[3 * i] = meanR;
    prevRgb[3 * i + 1] = meanG;
    prevRgb[3 * i + 2] = meanB;
    prevClaims[i] = ATLAS_CLAIM.dilated;
  }

  claims.set(prevClaims);
  rgb.set(prevRgb);
}
