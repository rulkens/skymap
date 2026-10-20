/**
 * warpCardToFisheye — pre-warps a flat card so that, projected through the
 * equidistant dome fisheye, it reads as a flat card hanging at direction `d`.
 *
 * Inverse mapping: each output pixel → NDC → dome direction `v`; the card lies
 * in the plane ⟂ `d` at unit distance, so the hit is `v / (v·d)`. The card's up
 * is the zenith projected into that plane (its top faces the disc centre) and
 * its right is dome +x, matching the fisheye's image-right. Nearest-neighbour
 * sampling keeps QR modules crisp. Pixels outside the card stay transparent.
 */

import type { PixelImage } from '../../@types/dome/PixelImage';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { directionToFisheye } from './directionToFisheye';
import { fisheyeDirection } from './fisheyeDirection';

const BORDER_SAMPLES = 16;

export function warpCardToFisheye(
  card: PixelImage,
  size: number,
  d: Readonly<Vec3>,
  halfWidthRad: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(size * size * 4);
  const up = normalize3([-d[0] * d[1], 1 - d[1] * d[1], -d[2] * d[1]]);
  const right = cross3(up, d);
  const halfW = Math.tan(halfWidthRad);
  const halfH = (halfW * card.height) / card.width;

  // Bounding box of the card's border in NDC, so the loop skips the rest of the disc.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= BORDER_SAMPLES; i++) {
    const a = (2 * i) / BORDER_SAMPLES - 1;
    for (const [s, t] of [
      [a, 1],
      [a, -1],
      [1, a],
      [-1, a],
    ] as const) {
      const p: Vec3 = [
        d[0] + s * halfW * right[0] + t * halfH * up[0],
        d[1] + s * halfW * right[1] + t * halfH * up[1],
        d[2] + s * halfW * right[2] + t * halfH * up[2],
      ];
      const [nx, ny] = directionToFisheye(normalize3(p));
      minX = Math.min(minX, nx);
      maxX = Math.max(maxX, nx);
      minY = Math.min(minY, ny);
      maxY = Math.max(maxY, ny);
    }
  }
  const px0 = Math.max(0, Math.floor(((minX + 1) / 2) * size) - 1);
  const px1 = Math.min(size - 1, Math.ceil(((maxX + 1) / 2) * size) + 1);
  const py0 = Math.max(0, Math.floor(((1 - maxY) / 2) * size) - 1);
  const py1 = Math.min(size - 1, Math.ceil(((1 - minY) / 2) * size) + 1);

  for (let py = py0; py <= py1; py++) {
    for (let px = px0; px <= px1; px++) {
      const v = fisheyeDirection(((px + 0.5) / size) * 2 - 1, 1 - ((py + 0.5) / size) * 2);
      if (v === null) continue;
      const along = dot3(v, d);
      if (along <= 0) continue;
      const s = dot3(v, right) / along / halfW;
      const t = dot3(v, up) / along / halfH;
      if (s < -1 || s >= 1 || t < -1 || t >= 1) continue;
      const sx = Math.floor(((s + 1) / 2) * card.width);
      const sy = Math.floor(((1 - t) / 2) * card.height);
      const src = (sy * card.width + sx) * 4;
      const dst = (py * size + px) * 4;
      out.set(card.data.subarray(src, src + 4), dst);
    }
  }
  return out;
}
