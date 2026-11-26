/**
 * Up to 16 passes of empty-takes-the-mean-of-its-filled-8-neighbours, then the atlas mean colour for
 * whatever is still empty (a black texel bleeds into every chart at low mips). Each pass visits only
 * the frontier (empty texels touching a filled one) and reads before it writes, so a texel filled in
 * pass k is first read in pass k+1, as with a double buffer. Stops early once nothing fills.
 */
import { ATLAS_CLAIM } from './atlasClaims';
import type { AtlasImage } from '../@types/AtlasImage';

const DILATE_PASSES = 16;

export function dilateAtlas(atlas: AtlasImage, claims: Int32Array): void {
  const { sizePx, rgb } = atlas;
  const queued = new Uint8Array(sizePx * sizePx);

  const forEachNeighbour = (i: number, visit: (ni: number) => void): void => {
    const x = i % sizePx;
    const y = (i - x) / sizePx;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(sizePx - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(sizePx - 1, x + 1); nx++) {
        if (nx !== x || ny !== y) visit(ny * sizePx + nx);
      }
    }
  };

  let frontier: number[] = [];
  for (let i = 0; i < sizePx * sizePx; i++) {
    if (claims[i] !== ATLAS_CLAIM.free) continue;
    let touchesFilled = false;
    forEachNeighbour(i, (ni) => {
      if (claims[ni] !== ATLAS_CLAIM.free) touchesFilled = true;
    });
    if (touchesFilled) {
      frontier.push(i);
      queued[i] = 1;
    }
  }

  for (let pass = 0; pass < DILATE_PASSES && frontier.length > 0; pass++) {
    // Colours are computed from the untouched grid first, then written, so a pass never reads its own fills.
    const colours = new Uint8Array(frontier.length * 3);
    frontier.forEach((i, f) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      forEachNeighbour(i, (ni) => {
        if (claims[ni] === ATLAS_CLAIM.free) return;
        r += rgb[3 * ni]!;
        g += rgb[3 * ni + 1]!;
        b += rgb[3 * ni + 2]!;
        count++;
      });
      colours[3 * f] = Math.round(r / count);
      colours[3 * f + 1] = Math.round(g / count);
      colours[3 * f + 2] = Math.round(b / count);
    });

    const next: number[] = [];
    frontier.forEach((i, f) => {
      rgb[3 * i] = colours[3 * f]!;
      rgb[3 * i + 1] = colours[3 * f + 1]!;
      rgb[3 * i + 2] = colours[3 * f + 2]!;
      claims[i] = ATLAS_CLAIM.dilated;
    });
    for (const i of frontier) {
      forEachNeighbour(i, (ni) => {
        if (claims[ni] !== ATLAS_CLAIM.free || queued[ni]) return;
        queued[ni] = 1;
        next.push(ni);
      });
    }
    frontier = next;
  }

  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  let filledCount = 0;
  for (let i = 0; i < sizePx * sizePx; i++) {
    if (claims[i] === ATLAS_CLAIM.free) continue;
    meanR += rgb[3 * i]!;
    meanG += rgb[3 * i + 1]!;
    meanB += rgb[3 * i + 2]!;
    filledCount++;
  }
  if (filledCount > 0) {
    meanR = Math.round(meanR / filledCount);
    meanG = Math.round(meanG / filledCount);
    meanB = Math.round(meanB / filledCount);
  }

  for (let i = 0; i < sizePx * sizePx; i++) {
    if (claims[i] !== ATLAS_CLAIM.free) continue;
    rgb[3 * i] = meanR;
    rgb[3 * i + 1] = meanG;
    rgb[3 * i + 2] = meanB;
    claims[i] = ATLAS_CLAIM.dilated;
  }
}
